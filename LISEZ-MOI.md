# RESTAURANT LACOUR — application installable avec votre propre serveur

Ce dossier contient tout ce qu’il faut pour héberger l’application chez vous :
les employés l’utilisent sur leur téléphone ou leur ordinateur **sans compte Claude**,
l’installent comme une vraie application (icône Lacour), et vos clients commandent
depuis un lien qui envoie la commande **directement** dans l’application.

## Contenu

| Fichier | Rôle |
|---|---|
| `server.js` | Serveur (base de données partagée, temps réel, commande en ligne). Aucune dépendance, il faut seulement Node.js 18 ou plus. |
| `public/index.html` | L’application de gestion. |
| `public/commande.html` | Page de commande pour les clients. |
| `public/shim.js`, `sw.js`, `manifest.webmanifest`, `icons/` | Connexion au serveur, installation et icônes. |
| `Dockerfile` | Pour les hébergeurs qui fonctionnent avec Docker. |
| `data/` | Créé automatiquement : vos données (`db.json`) et vos codes (`config.json`). **À sauvegarder.** |

## 1. Essai sur votre ordinateur (5 minutes)

1. Installez Node.js (version 18 ou plus) depuis nodejs.org.
2. Dans ce dossier, lancez : `node server.js`
3. Le serveur affiche le **code administrateur** (code d’installation du propriétaire). Notez-le. Le code des employés, lui, n’existe pas encore : c’est vous qui le générez dans l’application (voir « Codes d’accès » plus bas).
4. Ouvrez http://localhost:3000, saisissez le code administrateur, puis créez l’administrateur principal.

## 2. Mise en ligne (nécessaire pour les téléphones)

Pour que chacun utilise l’application sur son propre appareil, le serveur doit être accessible sur internet **en HTTPS** (le cadenas dans le navigateur). L’installation comme application ne fonctionne qu’en HTTPS.

### Option A : hébergeur avec Docker (le plus simple)
Render, Railway ou Fly.io acceptent ce dossier tel quel (via le `Dockerfile`) et fournissent le HTTPS.
- Créez un « Web Service » à partir de ce dossier (directement ou via un dépôt GitHub).
- **Ajoutez un disque persistant** monté sur `/data` : sans lui, vos données disparaissent à chaque redémarrage. Les offres gratuites n’en proposent généralement pas ; prenez une offre payante avec disque.
- Facultatif : ajoutez la variable `ADMIN_KEY` pour choisir vous-même le code d’installation (sinon le serveur en crée un et l’affiche dans ses journaux). Vous pourrez ensuite le changer dans l’application. Ne définissez pas `RESTO_KEY` : le code des employés est généré par l’administrateur dans l’application.

### Option B : petit serveur (VPS) avec nom de domaine
1. Installez Node.js, copiez ce dossier sur le serveur et lancez `node server.js` en service permanent (par exemple avec `systemd` ou `pm2`).
2. Placez un reverse proxy HTTPS devant, par exemple Caddy. Exemple de fichier `Caddyfile` :
   ```
   lacour.votre-domaine.com {
       reverse_proxy localhost:3000
   }
   ```
   Caddy obtient et renouvelle le certificat HTTPS tout seul.

## 3. Premier lancement et installation

1. Ouvrez l’adresse du site, saisissez le **code administrateur**, puis créez le compte de l’administrateur principal (nom, prénoms, **adresse e-mail**, PIN). L’adresse e-mail sert à récupérer vos codes en cas d’oubli.
2. Dans **Équipe**, ajoutez le gérant, les serveurs et les cuisiniers (photo, contact, adresse, CNSS, PIN).
3. Dans **Stock et carte**, saisissez vos plats avec leur prix et leur coût de revient. Dans **Réglages**, renseignez le numéro WhatsApp du restaurant.
4. Dans **Réglages > Codes d’accès**, cliquez sur **« Générer le code »** : c’est le code du restaurant. Envoyez ensuite aux employés le **lien d’installation et le code** avec le bouton WhatsApp de cette même section.
5. Installation :
   - **Android (Chrome)** : menu ⋮ puis « Installer l’application ».
   - **iPhone (Safari)** : Partager puis « Sur l’écran d’accueil ».
   - **Ordinateur (Chrome ou Edge)** : l’icône d’installation dans la barre d’adresse, ou menu puis « Installer ».
   L’icône Lacour s’affiche alors comme celle d’une vraie application.

## Nom, logo, groupes de menu et descriptions

- **Nom et logo du restaurant** : dans **Réglages**, changez le nom et envoyez votre logo (image PNG ou JPEG). Ils apparaissent en haut de l’application, sur les factures PDF et sur la page de commande des clients.
- **Groupes de menu** : dans **Stock et carte**, créez des groupes (Entrées, Plats, Boissons…), classez-les avec les flèches et rattachez chaque plat à un groupe. Le menu est présenté par groupe dans les commandes et sur la page client.
- **Description de commande** : champ facultatif à la création d’une commande, modifiable ensuite depuis la commande. Elle est visible en cuisine, sur la facture et dans le PDF.

## Rôles personnalisés

En plus des quatre rôles de base (administrateur principal, gérant, serveur, cuisinier), l’administrateur peut créer ses propres rôles dans **Équipe**, section **Rôles** : caissier, livreur, comptable, etc. Pour chaque rôle, il choisit :
- les **écrans accessibles** (Tables, Clients, Commandes, Livraisons, Cuisine, Stock et carte, Ventes et factures, Point du jour) ;
- les **autorisations** : annuler des commandes, modifier le stock, la carte et les dépenses.

Le rôle est ensuite proposé dans la fiche de chaque employé. Un rôle ne peut être supprimé que s’il n’est attribué à personne. Seul l’administrateur (code administrateur) peut créer ou modifier les rôles : le serveur refuse ces modifications avec le code des employés.

## Codes d’accès

- **Générés par l’administrateur principal** : dans **Réglages > Codes d’accès**, il génère le **code du restaurant** (donné aux employés) et peut régénérer le **code administrateur**. Un nouveau code remplace l’ancien immédiatement : les appareils concernés doivent saisir le nouveau code.
- **Récupération par e-mail** : sur l’écran de connexion, **« Code oublié ? (administrateur) »** demande l’adresse e-mail de l’administrateur principal (celle de sa fiche). Si elle correspond, le serveur lui envoie les deux codes par e-mail. Si l’adresse est inconnue, rien n’est envoyé et la réponse reste la même (on ne révèle pas quelles adresses existent). Limite : 8 demandes par 10 minutes et par adresse IP.
- Cela nécessite le service d’envoi d’e-mails décrit dans « Récupération du PIN par e-mail ». Sans lui, les codes restent consultables dans le fichier `data/config.json` du serveur.

## Installation sur téléphone dès l’ouverture du lien

- Envoyez le lien **`https://votre-site/installer`** (page d’installation) : à l’ouverture, elle reconnaît le téléphone et propose le bon geste : bouton **« Installer »** sur Android (Chrome), explications **Partager > Sur l’écran d’accueil** sur iPhone, et invitation à **ouvrir dans Chrome ou Safari** lorsque le lien a été ouvert depuis WhatsApp ou Facebook.
- L’application elle-même affiche aussi une **bannière d’installation** à l’ouverture sur téléphone (« Plus tard » la masque 3 jours). Elle disparaît une fois l’application installée.
- Le bouton **« Envoyer le lien et le code par WhatsApp »** de Réglages envoie en un message le lien d’installation et le code du restaurant.
- Sur iPhone, Apple n’autorise pas l’invite automatique : l’installation se fait toujours par le menu Partager de Safari.

## Récupération du PIN par e-mail

Si un employé oublie son PIN, il touche **« PIN oublié ? »** à l’écran de saisie du PIN : un **code à 6 chiffres** est envoyé à l’adresse e-mail enregistrée sur sa fiche (valable 15 minutes, utilisable une seule fois). Il saisit ce code avec son nouveau PIN, et c’est fait.

Pour que cela fonctionne :
1. **Renseignez l’adresse e-mail** de chaque employé dans **Équipe** (champ « Adresse e-mail »). Pour l’administrateur principal, elle est demandée à la création du compte.
2. **Configurez un service d’envoi d’e-mails** sur le serveur (gratuit pour un petit restaurant). Créez un compte chez **Brevo** ou **Resend**, validez votre adresse d’expéditeur, puis ajoutez ces variables sur votre hébergeur :
   - Brevo : `BREVO_API_KEY` (votre clé) et `MAIL_FROM` (l’adresse d’expéditeur validée)
   - ou Resend : `RESEND_API_KEY` et `MAIL_FROM`
3. Redémarrez le serveur.

Sans ce réglage, l’employé voit un message l’invitant à demander une réinitialisation à l’administrateur, qui peut toujours définir un nouveau PIN depuis la fiche de l’employé.

Protections : 3 codes maximum par profil et par 15 minutes, 5 essais par code, codes enregistrés sous forme chiffrée, adresse masquée à l’écran (a***@domaine.com). Les adresses e-mail ne sont lisibles que par l’administrateur.

## 4. Commande en ligne pour les clients

- Le lien à partager est `https://votre-site/commande.html` (affiché aussi dans Réglages).
- Le menu de la page vient directement de **Stock et carte** : toute modification est visible tout de suite.
- La commande arrive dans **Livraisons** (marquée « via Internet »), avec une alerte sonore sur les appareils connectés. Le serveur recalcule le prix à partir de votre carte : le client ne peut pas modifier les montants.
- Protections incluses : limite de 8 commandes par 10 minutes et par adresse, contrôle du nom, du téléphone et de l’adresse, champ piège contre les robots.

## Factures en PDF

Dans l’application, chaque facture payée peut être téléchargée en PDF (bouton « Télécharger en PDF » sur la facture, « PDF » dans Ventes et factures et dans la fiche du client). La fiche du client propose aussi « Toutes les factures en PDF » : un seul fichier avec une page par facture. Les PDF sont créés dans le navigateur : rien n’est envoyé à un tiers.

## 5. Sauvegardes (important)

Toutes vos données sont dans `data/db.json`. **Copiez ce fichier régulièrement** (chaque jour si possible) vers un autre endroit : un autre ordinateur, un stockage en ligne. Pour restaurer, remettez le fichier dans `data/` et redémarrez le serveur.

## 6. Sécurité : ce qu’il faut savoir

- Sans le bon code, personne ne peut lire ni modifier les données. Les fiches RH (contact, adresse, CNSS) ne sont lisibles qu’avec le **code administrateur**.
- Ne donnez le code administrateur qu’au propriétaire. Vous pouvez générer de nouveaux codes à tout moment dans **Réglages > Codes d’accès** (les appareils concernés devront saisir le nouveau code). Les codes sont enregistrés en clair dans `data/config.json` sur le serveur, pour pouvoir vous les renvoyer : protégez l’accès à ce fichier.
- Les PIN servent à choisir son profil et ses droits dans l’application. Ils sont enregistrés sous forme chiffrée, mais un PIN de 4 chiffres reste simple à deviner : ce n’est pas une protection forte. La vraie barrière est le code d’accès et le HTTPS.
- Les droits par profil (serveur, cuisinier, gérant) sont appliqués par l’application. Toute personne qui a le code du restaurant pourrait, avec des connaissances techniques, modifier des données hors de l’application. Ne diffusez ce code qu’aux employés.

## 7. Limites

- Un seul restaurant par serveur.
- Pas de sauvegarde automatique ni de reprise après panne : à vous de copier `data/db.json`.
- Les données de l’ancienne version hébergée sur claude.ai ne sont pas transférées automatiquement : ressaisissez la carte, les tables et l’équipe.
- Après une mise à jour des fichiers de `public/`, changez le numéro de version `V` dans `public/sw.js` pour que les appareils rechargent la nouvelle version.

## Pour le développeur

- API REST + flux temps réel (SSE) : `GET /api/stream?cols=…`, `GET|PUT|PATCH|DELETE /api/doc/:collection/:id`, `POST /api/lease/:collection/:id`, `GET /api/ping`. Authentification par l’en-tête `x-key`.
- Public (sans code) : `GET /api/public` et `POST /api/public/order`.
- Collections : `tables`, `stock`, `menu`, `clients`, `orders`, `expenses`, `team`, `hr` (réservée à l’administrateur), `meta`.
- `public/shim.js` reproduit côté navigateur l’interface de données utilisée par l’application (`window.claude.use("db")`), ce qui permet de garder `index.html` identique à la version hébergée sur claude.ai.
