# Déploiement Render

GitHub conserve le code. Render exécute le serveur Node et fournit son URL HTTPS. Le visuel Power BI interroge ce serveur ; les données viennent du modèle publié dans Power BI Service.

## Créer le service

1. Créer un compte sur https://dashboard.render.com avec GitHub.
2. Autoriser l'accès au dépôt privé `Nevets27450/Marmiton-dashboard`.
3. Une fois les fichiers de l'assistant poussés dans GitHub, choisir **New → Blueprint**, sélectionner le dépôt et utiliser le `render.yaml` à la racine.
4. Renseigner `GEMINI_API_KEY` dans les variables secrètes Render, jamais dans GitHub ou dans le chat. Vérifier le quota du modèle Gemini du projet.
5. Conserver le plan Free. Render définit le port et l'origine HTTPS via `PORT` et `RENDER_EXTERNAL_URL`. Pour un autre hébergeur, fournir `APP_MODE=hosted`, `APP_ORIGIN=https://votre-domaine`, et un `PORT` disponible.
6. Attendre un déploiement réussi et ouvrir l'URL du service. `/healthz` doit renvoyer `{"status":"ok"}`.

## Relier Power BI

Configurer le visuel avec l'URL réelle, depuis `assistant/powerbi-visual` :

```powershell
node configure-endpoint.mjs https://votre-serveur.onrender.com
npm.cmd run package -- --resources --skip-api
```

Importer le paquet obtenu dans Desktop ou mettre à jour les ressources déjà enregistrées du projet PBIP, puis recharger le projet. Cliquer sur **Se connecter** dans le visuel, confirmer **Autoriser et connecter** dans le navigateur, puis valider Microsoft si nécessaire. Le visuel détecte la session et active le chat automatiquement. Aucune instance Node locale ni copie de code de jumelage n'est nécessaire.

## Sessions et accès

Chaque navigateur dispose de sa propre session, de sa connexion Microsoft et de son historique. Un cookie HttpOnly/Secure/SameSite=Lax retrouve sa session, y compris en venant de Power BI. Les appels API exigent aussi un jeton privé et une origine autorisée. Le visuel obtient un jeton privé distinct du ticket à usage unique de la page d'autorisation. Ce ticket est transmis dans le fragment URL, retiré de l'historique, expire après dix minutes et doit être confirmé explicitement dans le navigateur. Les routes d'authentification ne sont pas accessibles au visuel depuis son origine opaque. Une déconnexion révoque tous les accès des visuels liés à la session. Les jetons Microsoft et la clé Gemini restent côté serveur. Le compte connecté doit avoir accès au modèle ; cet accès est vérifié avant d'autoriser le chat en mode hébergé.

La liaison se fait automatiquement après confirmation, sans code à recopier dans Power BI. La validation Microsoft peut encore demander son propre code de connexion ; il ne s'agit pas d'un code de jumelage. Le visuel privé n'utilise pas le SSO de l'hôte Power BI.

Les sessions et jetons sont en mémoire pour une seule instance : ils expirent après huit heures et sont perdus au redémarrage, au redéploiement ou à la veille de l'hébergeur. Cela impose une reconnexion avec le bouton du visuel. Une recréation du visuel (fermeture/réouverture du rapport ou changement de page selon l'hôte) perd aussi son jeton conservé uniquement en mémoire. Ne pas activer plusieurs réplicas sans stockage de sessions partagé. La version gratuite Render se met en veille après 15 minutes d'inactivité ; ce déploiement est un prototype et ne garantit pas une disponibilité continue.

Ne pas copier `.env`, des caches ou des fichiers `.pbix` dans le dépôt pour déployer. Les comptes externes ne reçoivent pas automatiquement l'accès au modèle Power BI. Tester le parcours Microsoft et les autorisations du visuel avec l'URL HTTPS réelle avant de considérer l'intégration comme opérationnelle.
