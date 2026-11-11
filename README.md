# 🏠 Simulatore Mutuo Casa

Simulatore di mutuo casa italiano: tasso fisso, variabile e misto, confronto tra scenari, piano di ammortamento, estinzione anticipata, stress test e affitto vs acquisto.

È un sito **statico** (solo HTML, CSS e JavaScript): non serve installare nulla, funziona offline e tutti i calcoli avvengono nel browser. Nessun dato viene inviato a server esterni.

---

## 💻 Usarlo sul tuo computer

1. Apri la cartella del progetto.
2. Fai **doppio clic su `index.html`**: si apre nel browser (Edge, Chrome, Firefox…).

Non serve la connessione a internet: la libreria dei grafici (Chart.js) è già inclusa nella cartella `vendor/`.

> ℹ️ I dati inseriti vengono salvati nel browser che stai usando. La versione locale e quella pubblicata online hanno salvataggi **separati**: per spostare i dati dall'una all'altra usa **💾 Esporta** e **📂 Importa**.
>
> Il pulsante **🔗 Condividi** in locale crea un link che funziona solo sul tuo computer; dalla versione online, invece, il link si può inviare a chiunque.

---

## 🌐 Pubblicarlo gratis su GitHub Pages

Serve solo un account gratuito su [github.com](https://github.com). Con il piano gratuito il repository deve essere **pubblico**.

### Metodo A – dal sito di GitHub (senza installare nulla)

1. Accedi a GitHub e clicca **New repository** (pulsante **+** in alto a destra → *New repository*).
2. Dai un nome al repository, ad esempio `simulatore-mutuo`, scegli **Public** e clicca **Create repository**.
3. Nella pagina del repository vuoto clicca il link **uploading an existing file**.
4. Trascina nella pagina **il contenuto** della cartella del progetto (non la cartella stessa):
   `index.html`, `.nojekyll`, `README.md` e le cartelle `css`, `js`, `vendor`.
5. Clicca **Commit changes**.
6. Vai su **Settings → Pages** e in *Build and deployment* imposta:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` e cartella `/ (root)` → **Save**
7. Dopo 1–2 minuti il sito è online all'indirizzo
   `https://<tuo-utente>.github.io/simulatore-mutuo/`
   (l'indirizzo esatto compare in alto nella pagina *Settings → Pages*).

### Metodo B – con git (da terminale)

Dopo aver creato il repository vuoto su GitHub (punti 1–2 del metodo A), dalla cartella del progetto:

```powershell
git init
git add .
git commit -m "Prima pubblicazione"
git branch -M main
git remote add origin https://github.com/<tuo-utente>/simulatore-mutuo.git
git push -u origin main
```

Poi attiva GitHub Pages come al punto 6 del metodo A.

### Aggiornare il sito

Modifica i file sul tuo computer e controlla il risultato aprendo `index.html`, poi:

- **Metodo A**: nel repository clicca **Add file → Upload files** e ricarica i file modificati (mantenendo le stesse cartelle);
- **Metodo B**: `git add .`, `git commit -m "Aggiornamento"`, `git push`.

GitHub Pages pubblica la nuova versione in circa un minuto (se non la vedi, ricarica la pagina con `Ctrl+F5`).

---

## 📁 Struttura dei file

| Percorso | Contenuto |
|---|---|
| `index.html` | Pagina principale dell'applicazione |
| `css/style.css` | Stili (tema chiaro/scuro, stampa) |
| `js/engine.js` | Motore di calcolo del mutuo |
| `js/ui-*.js` | Interfaccia delle singole schede |
| `js/app.js` | Avvio, schede e azioni dell'intestazione |
| `vendor/chart.umd.min.js` | Libreria Chart.js per i grafici |
| `.nojekyll` | Indica a GitHub Pages di pubblicare i file così come sono |

> ⚠️ GitHub distingue maiuscole e minuscole nei nomi dei file: se aggiungi o rinomini file, usa nei collegamenti esattamente lo stesso nome.

---

⚠️ Simulazione indicativa: i risultati non costituiscono offerta né consulenza finanziaria.
