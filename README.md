# Occhio!

Un navigatore per chi va in motorino a Roma: confronta la strada più veloce con una più
prudente, dice prima di partire quali sono i tratti critici del percorso e avvisa prima di
ognuno mentre si guida.

- **Prova:** https://lsinigaglia.github.io/occhio/ (pensato per il telefono)
- **Prova degli avvisi da fermi:** https://lsinigaglia.github.io/occhio/?prova

Progetto nato ad AgenticHack Rome (13–14 novembre 2026).

## Cosa fa

- **Due percorsi a confronto.** Si scrive dove si va: Occhio! calcola la strada più veloce e
  una più prudente, con minuti, chilometri e incidenti registrati lungo il tragitto.
- **Tratti critici prima di partire.** Al massimo tre o quattro per viaggio, segnati in
  arancione sul percorso, con una frase sola su cosa guardare ("Occhio alle macchine",
  "Occhio agli incroci").
- **Guida con le svolte.** Indicazioni sullo schermo calcolate dalla geometria delle strade,
  con ricalcolo quando si esce dal percorso.
- **Avviso prima di ogni tratto critico.** Una card grande nera e arancione, pensata per la
  coda dell'occhio di chi guida, e la voce che dice "Occhio!". Compare 300 metri prima.
- **Simulazione** del viaggio, per provarlo da fermi.
- **App Android** (`android/`): tiene gli avvisi attivi con il telefono in tasca o mentre si
  usa un altro navigatore, con notifica, voce e card a tutto schermo.

## Dati

- **Incidenti:** open data di Roma Capitale, incidenti rilevati dalla Polizia Locale
  (`dati.comune.roma.it`), da gennaio 2018 ad agosto 2022. Licenza CC BY / CC BY-SA.
- **Strade:** OpenStreetMap, via Overpass API, con i divieti di svolta. Licenza ODbL.
- **Mappa di base:** OpenFreeMap. **Ricerca indirizzi:** Photon (Komoot).
- **Voce:** clip registrate con ElevenLabs.

Su 127.250 incidenti del periodo, 123.428 hanno coordinate. Di questi ne vengono scartati
26.443 perché registrati su una coordinata "di ripiego": quando nel verbale manca il punto
esatto, il sistema di origine li colloca su un punto generico della strada, creando punti
critici finti. Ne restano 96.985.

Le coordinate sono ricavate dall'indirizzo del verbale (via e traversa, o civico), non da un
GPS, e sono arrotondate a circa 10 metri: bastano per dire "questo incrocio", non "questo
metro".

Un punto critico è un tratto di circa 90 metri con almeno 22 incidenti nel periodo: sono 628
e raccolgono più di un incidente su cinque. Lungo un percorso, i punti critici vicini vengono
uniti in un solo tratto.

## Come viene scelto il percorso prudente

Ogni incidente viene agganciato al tratto di strada o all'incrocio più vicino. Il peso cresce
con la gravità (solo danni, feriti, prognosi riservata, vittime) e se sono coinvolti moto,
ciclomotori, bici o monopattini. Il percorso prudente minimizza tempo più rischio, ed è
proposto solo se costa al massimo il 30% di tempo in più (+1 minuto), il 40% di strada in più,
e non attraversa più punti critici del percorso veloce.

## Limiti

- Non garantisce un viaggio sicuro e non dimostra una riduzione degli incidenti.
- Non conosce il traffico: i tempi sono medie per tipo di strada, e dove passano più veicoli
  avvengono più incidenti.
- I dati pubblici si fermano ad agosto 2022: un incrocio può essere stato modificato dopo.
  `docs/data/notes.json` raccoglie gli aggiornamenti verificati sui singoli punti.
- Profilo unico per veicoli a motore; non considera le ZTL.
- L'app Android è una versione di prova, non pubblicata sugli store.

## Struttura

- `docs/` — l'app (HTML, CSS e JavaScript senza build). `worker.js` calcola i percorsi nel
  browser; `data/graph.json` è la rete stradale con il rischio per tratto.
- `android/` — l'app Android (Java, senza Gradle): mostra l'app web e aggiunge posizione in
  background, notifiche, voce e card a tutto schermo.
- `pipeline/download.py` — scarica strade e incidenti in `data/raw/`.
- `pipeline/build.py` — costruisce `docs/data/graph.json` e `docs/data/hotspots.json`.
- `pipeline/voice.py` — genera le clip vocali (serve una chiave ElevenLabs in `.env`).
- `pipeline/dev_server.py` — server locale per le prove su un telefono collegato via USB.
- `pipeline/publish.sh` — pubblica una nuova versione su GitHub Pages.

## Rigenerare i dati

```
python pipeline/download.py
python pipeline/build.py
```

Serve solo Python 3.10+ (nessuna dipendenza). Il portale open data del Comune risponde a
tratti: `download.py` riprova e salta i file già scaricati.

## Uso dell'AI

Il progetto è stato costruito con Claude Code, che ha lavorato da agente su tutta la catena:
scaricare e verificare i dati, individuare le coordinate di ripiego, scrivere il motore di
calcolo e l'interfaccia, costruire l'app Android, provarla su un telefono reale e cercare sul
web gli aggiornamenti sui punti critici. Nell'app in esecuzione non ci sono chiamate a modelli.
