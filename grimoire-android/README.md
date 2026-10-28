# Grimoire de Fer — Application Android

Application de suivi de programme de sport, ambiance vampire noble et voûtes d'ogives.  
Basée sur Capacitor (WebView Android native) — aucune dépendance cloud requise.

## Compiler l'APK

### Option A — GitHub Actions (recommandé, aucun outil à installer)

1. Créer un dépôt GitHub et pousser ce dossier :
   ```
   git init
   git add .
   git commit -m "Grimoire de Fer - Android"
   git remote add origin https://github.com/TON-PSEUDO/grimoire-de-fer-android.git
   git push -u origin main
   ```
2. Sur GitHub, aller dans **Actions → Build APK → Run workflow**.
3. Une fois le build terminé (~5 min), télécharger l'APK dans les **Artifacts** du run.

### Option B — Android Studio (si tu l'as déjà)

1. Ouvrir Android Studio → **Open** → sélectionner le dossier `android/`
2. Menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. L'APK se trouve dans `android/app/build/outputs/apk/debug/app-debug.apk`

### Option C — Ligne de commande (Linux/Mac, avec Android SDK)

```bash
npm ci
npx cap sync android
cd android
./gradlew assembleDebug
```

L'APK se trouve dans `android/app/build/outputs/apk/debug/app-debug.apk`.

## Installer l'APK sur Android

1. Copier `app-debug.apk` sur le téléphone (USB, e-mail, Drive…)
2. Sur Android : **Paramètres → Sécurité → Sources inconnues** (activer)
3. Ouvrir le fichier APK depuis le téléphone → Installer

## Fonctionnement

- Les données sont sauvegardées **sur le téléphone** (localStorage Android).
- Export / Import JSON disponible en bas de page pour sauvegarder ou transférer.
- Aucun serveur requis.

## Structure

```
grimoire-de-fer-android/
├── www/                   ← site web (HTML/CSS/JS)
├── android/               ← projet Android natif (Gradle)
├── capacitor.config.json
├── package.json
└── .github/workflows/build-apk.yml
```
