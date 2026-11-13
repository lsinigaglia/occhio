# Occhio

Percorsi con meno punti critici a Roma, per chi si muove su due ruote.

Occhio confronta il percorso più veloce con quello che attraversa meno punti dove sono
avvenuti incidenti, e avvisa prima di ognuno. Gira nel browser del telefono, senza server.

Progetto nato ad AgenticHack Rome (13–14 novembre 2026).

## Cosa fa

- Mappa dei punti critici di Roma dentro il raccordo: tratti di circa 90 metri con almeno
  8 incidenti nel periodo dei dati.
- Ricerca di partenza e arrivo, con confronto tra percorso più veloce e percorso più prudente:
  minuti, chilometri, punti critici, incidenti registrati sul tragitto.
- Scheda di ogni punto critico: numeri, dinamica più frequente, quando succede, un consiglio.
- Viaggio guidato con avviso a schermo e a voce prima di ogni punto critico; modalità
  simulazione per provarlo da fermi.
- Apertura del percorso scelto in Google Maps.

## Dati

- **Incidenti:** open data di Roma Capitale, incidenti rilevati dalla Polizia Locale
  (`dati.comune.roma.it`), mesi da marzo 2021 a giugno 2022. Licenza CC BY / CC BY-SA.
- **Strade:** OpenStreetMap, via Overpass API. Licenza ODbL.
- **Mappa di base:** OpenFreeMap. **Ricerca indirizzi:** Photon (Komoot).

Su 39.156 incidenti del periodo, 38.067 hanno coordinate. Di questi ne vengono scartati 7.349
perché registrati su una coordinata "di ripiego": quando la posizione esatta non è nota, il
sistema di origine li colloca tutti sullo stesso punto della strada, creando punti critici
finti. Ne restano 30.718.

## Come viene scelto il percorso prudente

Ogni incidente viene agganciato al tratto di strada o all'incrocio più vicino. Il peso cresce
con la gravità (solo danni, feriti, prognosi riservata, vittime) e se sono coinvolti moto,
ciclomotori, bici o monopattini. Il percorso prudente minimizza tempo più rischio, ed è
proposto solo se costa al massimo il 30% di tempo in più (+1 minuto), il 40% di strada in più,
e non attraversa più punti critici del percorso veloce.

## Limiti

- Non garantisce un viaggio sicuro e non dimostra una riduzione degli incidenti.
- Non conosce i volumi di traffico: dove passano più veicoli avvengono più incidenti.
- I dati pubblici si fermano ad agosto 2022: un incrocio può essere stato modificato dopo.
  `docs/data/notes.json` raccoglie gli aggiornamenti verificati sui singoli punti.
- Profilo unico per veicoli a motore; non considera ZTL né divieti di svolta.

## Struttura

- `docs/` — l'app (HTML, CSS e JavaScript senza build). `worker.js` calcola i percorsi nel
  browser; `data/graph.json` è la rete stradale con il rischio per tratto.
- `pipeline/download.py` — scarica strade e incidenti in `data/raw/`.
- `pipeline/build.py` — costruisce `docs/data/graph.json` e `docs/data/hotspots.json`.
- `pipeline/dev_server.py` — server locale per le prove su un telefono collegato via USB.

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
calcolo e l'interfaccia, provarla su un telefono reale e cercare sul web gli aggiornamenti sui
punti critici. Nell'app in esecuzione non ci sono chiamate a modelli.
