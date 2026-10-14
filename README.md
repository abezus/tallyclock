# Tally Clock

Cumulative timers for the things you spend time on. Installable on phone and laptop, works offline, and syncs between devices through a free Firebase project.

Cost: $0. GitHub Pages hosts the files for free, and Firebase's free (Spark) plan covers one person's timers with a lot of room to spare. Nothing to maintain or renew.

---

## 1. Put it on GitHub Pages (about 5 minutes)

1. Sign in at github.com and click **New repository**. Name it `tally-clock`, make it **Public**, and click **Create repository**.
2. On the new repo page, click **uploading an existing file**. Drag in everything from this folder, including the `icons` folder, and click **Commit changes**.
3. Go to **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, Branch to **main** and folder **/ (root)**, then **Save**.
4. After a minute, your app is at `https://YOUR-USERNAME.github.io/tally-clock/`.

At this point the app works, but each device keeps its own timers. Step 2 turns on sync.

## 2. Turn on sync with Firebase (about 10 minutes)

1. Go to https://console.firebase.google.com and click **Create a project**. Name it `tally-clock`. You can switch off Google Analytics.
2. **Turn on sign-in:** in the left menu open **Build → Authentication → Get started**. Under *Sign-in method*, choose **Email/Password**, switch it on, and save.
3. **Allow your site to sign in:** still in Authentication, open **Settings → Authorized domains → Add domain** and add `YOUR-USERNAME.github.io`.
4. **Create the database:** open **Build → Firestore Database → Create database**. Pick a location near you (for example `eur3 (europe-west)`) and start in **production mode**.
5. **Lock it to you:** in Firestore, open the **Rules** tab, replace everything with the contents of `firestore.rules` from this folder, and click **Publish**.
6. **Get your settings:** click the gear icon → **Project settings**. Under *Your apps*, click the web icon `</>`, give it a nickname, and register it (skip Firebase Hosting). Copy the `firebaseConfig = { ... }` block it shows you.
7. In your GitHub repo, open `firebase-config.js`, click the pencil icon to edit, and replace `export const firebaseConfig = null;` with:

   ```js
   export const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
   Commit the change. These values are safe to publish: they only identify your project, and the rules from step 5 stop anyone else from reading or writing your timers.

8. Open the app, tap **Sign in to sync**, and tap **Create account** with your email and a password. On your other device, open the app and **Sign in** with the same email and password.

If you already tracked time before signing in, the first device you sign in on uploads its timers. Devices that sign in after that switch to the synced timers.

## 3. Install it

- **iPhone:** open the link in Safari → Share → **Add to Home Screen**.
- **Android:** open the link in Chrome → menu ⋮ → **Install app** (or *Add to Home screen*).
- **Laptop:** in Chrome or Edge, click the install icon at the right end of the address bar.

## Changing the app later

Edit the files in your repo. Then open `sw.js` and change `const VERSION = 'tally-v1'` to `'tally-v2'` (and so on). That tells installed copies to fetch the new files. Close and reopen the app on each device to pick up the change.

## What's in this folder

| File | What it does |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The app |
| `firebase-config.js` | Your Firebase settings (null = sync off) |
| `firestore.rules` | Database rules to paste into Firebase |
| `manifest.webmanifest`, `icons/` | Name and icon for installing |
| `sw.js` | Lets the app open and run offline |
