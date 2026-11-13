package it.occhio.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.util.Log;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Mostra l'app web di Occhio e le offre tre cose che un sito non può fare:
 * avvisi in background (AlertService), voce di sistema e apertura diretta di Google Maps.
 */
public class MainActivity extends Activity {
    private static final String TAG = "Occhio";
    private static final String SITE = "https://lsinigaglia.github.io/occhio/";

    private static final String OFFLINE = "<meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<body style='font-family:sans-serif;padding:32px 24px;color:#1f1f1f'><h2>Occhio non riesce a collegarsi</h2>"
            + "<p style='color:#5f6368;line-height:1.4'>Serve una connessione a internet per caricare la mappa.</p>"
            + "<a href='" + SITE + "' style='display:inline-block;margin-top:12px;padding:12px 22px;border-radius:24px;"
            + "background:#1a73e8;color:#fff;text-decoration:none;font-weight:500'>Riprova</a></body>";

    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady;
    private volatile boolean trusted;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private String pendingTrip;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView v, String url, Bitmap icon) {
                trusted = isOurs(Uri.parse(url));
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (!r.isForMainFrame()) return;
                v.loadDataWithBaseURL(null, OFFLINE, "text/html", "utf-8", null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (isOurs(r.getUrl())) return false;
                open(r.getUrl());
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (hasLocation()) {
                    cb.invoke(origin, true, false);
                } else {
                    geoOrigin = origin;
                    geoCallback = cb;
                    askPermissions();
                }
            }
        });
        web.addJavascriptInterface(new Bridge(), "OcchioNative");

        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                tts.setLanguage(Locale.ITALIAN);
                ttsReady = true;
            }
        });

        if (debuggable()) web.clearCache(true);   // nelle prove si vuole sempre l'ultima versione del sito
        askPermissions();
        String url = debuggable() ? getIntent().getStringExtra("url") : null; // solo per le prove via USB
        web.loadUrl(url != null && isOurs(Uri.parse(url)) ? url : SITE);
        debugTrip(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        debugTrip(intent);
    }

    /** Prove via adb: avvia gli avvisi con un tragitto passato in base64 (solo build di debug). */
    private void debugTrip(Intent intent) {
        String b64 = intent.getStringExtra("trip64");
        if (b64 == null || !debuggable()) return;
        try {
            startTrip(new String(Base64.decode(b64, Base64.DEFAULT), StandardCharsets.UTF_8));
        } catch (Exception e) {
            Log.e(TAG, "trip64 non valido", e);
        }
    }

    private boolean debuggable() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private static boolean isOurs(Uri u) {
        String host = u.getHost();
        if (host == null) return false;
        if (host.equals("lsinigaglia.github.io")) return u.getPath() != null && u.getPath().startsWith("/occhio");
        return host.equals("localhost") || host.equals("127.0.0.1");
    }

    private void open(Uri u) {
        Intent i = new Intent(Intent.ACTION_VIEW, u);
        String h = u.getHost() == null ? "" : u.getHost();
        if (h.contains("google.") || "google.navigation".equals(u.getScheme())) i.setPackage("com.google.android.apps.maps");
        try {
            startActivity(i);
        } catch (Exception e) {
            i.setPackage(null);
            try {
                startActivity(i);
            } catch (Exception ignored) { }
        }
    }

    private boolean hasLocation() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void askPermissions() {
        List<String> need = new ArrayList<>();
        if (!hasLocation()) need.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            need.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), 1);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        if (geoCallback != null) {
            geoCallback.invoke(geoOrigin, hasLocation(), false);
            geoCallback = null;
        }
        if (pendingTrip != null && hasLocation()) {
            String t = pendingTrip;
            pendingTrip = null;
            startTrip(t);
        }
    }

    private void startTrip(String json) {
        if (!hasLocation()) {
            pendingTrip = json;
            askPermissions();
            return;
        }
        startForegroundService(new Intent(this, AlertService.class).putExtra("trip", json));
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.occhioBack && window.occhioBack()) ? 1 : 0", v -> {
            if (!"1".equals(v)) moveTaskToBack(true);
        });
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    /** Funzioni esposte alla pagina, solo quando è la nostra. */
    private class Bridge {
        @JavascriptInterface
        public boolean startTrip(String json) {
            if (!trusted) return false;
            if (!hasLocation()) {
                runOnUiThread(MainActivity.this::askPermissions);
                return false;
            }
            runOnUiThread(() -> MainActivity.this.startTrip(json));
            return true;
        }

        @JavascriptInterface
        public void stopTrip() {
            if (!trusted || !AlertService.active) return;
            runOnUiThread(() -> startService(new Intent(MainActivity.this, AlertService.class).setAction(AlertService.ACTION_STOP)));
        }

        @JavascriptInterface
        public boolean isActive() {
            return AlertService.active;
        }

        @JavascriptInterface
        public void speak(String text) {
            if (trusted && ttsReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, new Bundle(), "ui");
        }

        @JavascriptInterface
        public void keepAwake(boolean on) {
            if (!trusted) return;
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void openMaps(String url) {
            if (!trusted) return;
            runOnUiThread(() -> open(Uri.parse(url)));
        }
    }
}
