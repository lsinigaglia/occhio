package it.occhio.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Servizio in primo piano che segue la posizione mentre l'utente usa un altro navigatore
 * e avvisa, con una notifica e mezza frase a voce, poco prima di ogni punto critico del tragitto.
 */
public class AlertService extends Service implements LocationListener {
    static final String ACTION_STOP = "it.occhio.app.STOP";
    static volatile boolean active;

    private static final String TAG = "Occhio";
    private static final String CH_BG = "occhio_attivo";
    private static final String CH_ALERT = "occhio_avvisi";

    private static class Alert {
        double lat, lon;
        String name, phrase;
        String[] clips;            // indirizzi delle clip registrate (può essere vuoto)
        volatile File[] files;     // le stesse clip, scaricate sul telefono
        boolean done;
        float last = Float.NaN;
    }

    private final List<Alert> alerts = new ArrayList<>();
    private final List<String> waiting = new ArrayList<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable stopLater = this::stopSelf;
    private LocationManager lm;
    private NotificationManager nm;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private AudioAttributes voiceAttrs;
    private TextToSpeech tts;
    private boolean ttsReady;
    private int fired;
    private int shownLeft = -1;
    private final ArrayDeque<File> queue = new ArrayDeque<>();
    private MediaPlayer player;
    private BroadcastReceiver debugReceiver;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        nm = getSystemService(NotificationManager.class);
        audio = getSystemService(AudioManager.class);
        lm = getSystemService(LocationManager.class);

        NotificationChannel bg = new NotificationChannel(CH_BG, "Occhio attivo", NotificationManager.IMPORTANCE_LOW);
        NotificationChannel al = new NotificationChannel(CH_ALERT, "Avvisi punti critici", NotificationManager.IMPORTANCE_HIGH);
        al.enableVibration(true);
        al.setVibrationPattern(new long[]{0, 250, 120, 250});
        al.setSound(null, null); // la voce fa da suono
        al.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(bg);
        nm.createNotificationChannel(al);

        voiceAttrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
        // abbassa per un attimo l'audio delle altre app (musica, navigatore) mentre parla
        focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(voiceAttrs)
                .build();
        tts = new TextToSpeech(this, this::onVoiceReady);

        // Solo nelle build di prova: posizioni finte inviate via adb, per provare gli avvisi da fermi.
        //   adb shell am broadcast -a it.occhio.app.DEBUG_LOC --es loc "41.8787,12.4791"
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            debugReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent i) {
                    try {
                        String[] p = i.getStringExtra("loc").split(",");
                        Location l = new Location("debug");
                        l.setLatitude(Double.parseDouble(p[0]));
                        l.setLongitude(Double.parseDouble(p[1]));
                        onLocationChanged(l);
                    } catch (Exception e) {
                        Log.e(TAG, "posizione di prova non valida", e);
                    }
                }
            };
            IntentFilter f = new IntentFilter("it.occhio.app.DEBUG_LOC");
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(debugReceiver, f, Context.RECEIVER_EXPORTED);
            else registerReceiver(debugReceiver, f);
        }
    }

    private void onVoiceReady(int status) {
        if (status != TextToSpeech.SUCCESS) {
            Log.w(TAG, "sintesi vocale non disponibile");
            return;
        }
        int lang = tts.setLanguage(Locale.ITALIAN);
        Log.i(TAG, "voce italiana: " + (lang >= TextToSpeech.LANG_AVAILABLE ? "disponibile" : "NON disponibile (" + lang + ")"));
        tts.setAudioAttributes(voiceAttrs);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { }
            @Override public void onDone(String id) { audio.abandonAudioFocusRequest(focus); }
            @Override public void onError(String id) { audio.abandonAudioFocusRequest(focus); }
        });
        ttsReady = true;
        for (String s : waiting) speak(s);
        waiting.clear();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        alerts.clear();
        fired = 0;
        shownLeft = -1;
        handler.removeCallbacks(stopLater);
        try {
            JSONArray arr = new JSONObject(intent.getStringExtra("trip")).getJSONArray("alerts");
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                Alert a = new Alert();
                a.lat = o.getDouble("lat");
                a.lon = o.getDouble("lon");
                a.name = o.getString("name");
                a.phrase = o.optString("phrase", "");
                JSONArray cl = o.optJSONArray("clips");
                a.clips = new String[cl == null ? 0 : cl.length()];
                for (int k = 0; k < a.clips.length; k++) a.clips[k] = cl.getString(k);
                alerts.add(a);
            }
        } catch (Exception e) {
            Log.e(TAG, "tragitto non valido", e);
        }
        Notification n = ongoing(alerts.size());
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(1, n);
        active = true;
        try {
            lm.removeUpdates(this);
            for (String p : new String[]{LocationManager.GPS_PROVIDER, "fused"}) {
                if (lm.getAllProviders().contains(p) && lm.isProviderEnabled(p)) {
                    lm.requestLocationUpdates(p, 1000L, 0f, this, Looper.getMainLooper());
                }
            }
        } catch (SecurityException e) {
            Log.e(TAG, "permesso di posizione mancante", e);
            stopSelf();
        }
        Log.i(TAG, "avvisi attivi: " + alerts.size());
        final List<Alert> toFetch = new ArrayList<>(alerts);
        new Thread(() -> fetchClips(toFetch)).start();
        return START_NOT_STICKY;
    }

    @Override
    public void onLocationChanged(Location loc) {
        float speed = loc.hasSpeed() ? loc.getSpeed() : 8f;
        // circa 20 secondi di anticipo, tra 160 e 350 metri
        float threshold = Math.max(160f, Math.min(350f, speed * 20f));
        float[] r = new float[1];
        int left = 0;
        for (Alert a : alerts) {
            if (a.done) continue;
            Location.distanceBetween(loc.getLatitude(), loc.getLongitude(), a.lat, a.lon, r);
            float d = r[0];
            boolean approaching = !Float.isNaN(a.last) && d < a.last - 1f;
            a.last = d;
            if (d <= threshold && approaching) {
                a.done = true;
                fire(a, d);
            } else {
                left++;
            }
        }
        if (left != shownLeft) {
            shownLeft = left;
            nm.notify(1, ongoing(left));
            if (left == 0) handler.postDelayed(stopLater, 120000L);
        }
    }

    private void fire(Alert a, float d) {
        int m = Math.max(50, Math.round(d / 50f) * 50);
        String text = a.phrase.isEmpty() ? a.name : a.name + " — " + a.phrase;
        Notification n = new Notification.Builder(this, CH_ALERT)
                .setSmallIcon(R.drawable.ic_notif)
                .setColor(0xFFD93025)
                .setContentTitle("Occhio · tra " + m + " m")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setCategory(Notification.CATEGORY_NAVIGATION)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setTimeoutAfter(20000L)
                .setContentIntent(openApp())
                .build();
        nm.notify(100 + fired++, n);
        if (!playClips(a)) speak("Occhio. " + a.name + ". " + a.phrase);
        Log.i(TAG, "avviso: " + text + " a " + m + " m");
    }

    /** Scarica le clip registrate alla partenza, così all'avviso sono già sul telefono. */
    private void fetchClips(List<Alert> list) {
        for (Alert a : list) {
            if (a.clips.length == 0) continue;
            File[] files = new File[a.clips.length];
            boolean ok = true;
            for (int i = 0; i < a.clips.length && ok; i++) {
                File f = new File(getCacheDir(), "clip_" + Integer.toHexString(a.clips[i].hashCode()) + ".mp3");
                if (!f.exists() || f.length() == 0) ok = download(a.clips[i], f);
                files[i] = f;
            }
            if (ok) a.files = files;
        }
        Log.i(TAG, "clip vocali pronte");
    }

    private boolean download(String url, File out) {
        File tmp = new File(out.getPath() + ".tmp");
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            if (c.getResponseCode() != 200) return false;
            try (InputStream in = c.getInputStream(); FileOutputStream os = new FileOutputStream(tmp)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            }
            return tmp.renameTo(out);
        } catch (Exception e) {
            Log.w(TAG, "clip non scaricata: " + url);
            tmp.delete();
            return false;
        }
    }

    /** Riproduce le clip dell'avviso una dopo l'altra. Ritorna false se non sono disponibili. */
    private boolean playClips(Alert a) {
        File[] files = a.files;
        if (files == null) return false;
        for (File f : files) if (!f.exists()) return false;
        for (File f : files) queue.add(f);
        if (player == null) playNext();
        return true;
    }

    private void playNext() {
        File f = queue.poll();
        if (f == null) {
            player = null;
            audio.abandonAudioFocusRequest(focus);
            return;
        }
        try {
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(voiceAttrs);
            mp.setDataSource(f.getAbsolutePath());
            mp.setOnCompletionListener(m -> { m.release(); playNext(); });
            mp.setOnErrorListener((m, what, extra) -> { m.release(); playNext(); return true; });
            mp.prepare();
            audio.requestAudioFocus(focus);
            mp.start();
            player = mp;
        } catch (Exception e) {
            Log.w(TAG, "clip non riproducibile", e);
            playNext();
        }
    }

    private void speak(String text) {
        if (!ttsReady) {
            waiting.add(text);
            return;
        }
        audio.requestAudioFocus(focus);
        tts.speak(text, TextToSpeech.QUEUE_ADD, new Bundle(), "avviso" + System.nanoTime());
    }

    private PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification ongoing(int left) {
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, AlertService.class).setAction(ACTION_STOP),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String text = left == 0 ? "Nessun altro punto critico sul tragitto"
                : left == 1 ? "Ti avviso prima dell'ultimo punto critico"
                : "Ti avviso prima di " + left + " punti critici";
        return new Notification.Builder(this, CH_BG)
                .setSmallIcon(R.drawable.ic_notif)
                .setColor(0xFF188038)
                .setContentTitle("Occhio è attivo")
                .setContentText(text)
                .setOngoing(true)
                .setContentIntent(openApp())
                .addAction(new Notification.Action.Builder(null, "Termina", stop).build())
                .build();
    }

    @Override
    public void onDestroy() {
        active = false;
        handler.removeCallbacks(stopLater);
        try {
            lm.removeUpdates(this);
        } catch (Exception ignored) { }
        if (debugReceiver != null) unregisterReceiver(debugReceiver);
        if (tts != null) tts.shutdown();
        queue.clear();
        if (player != null) { try { player.release(); } catch (Exception ignored) { } player = null; }
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public void onProviderEnabled(String provider) {
        try {
            lm.requestLocationUpdates(provider, 1000L, 0f, this, Looper.getMainLooper());
        } catch (SecurityException | IllegalArgumentException ignored) { }
    }
    @Override public void onProviderDisabled(String provider) { }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
}
