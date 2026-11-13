# Assistant Marmiton dans Power BI Desktop — serveur HTTPS

Le visuel 1.0.4 pointe vers https://marmiton-assistant.onrender.com et se connecte sans copie de code de jumelage. Aucun serveur Node local n'est nécessaire. Le serveur utilise le modèle publié dans Power BI Service. Les filtres du rapport ne sont pas transmis au chat. Le parcours complet dans Desktop reste à vérifier après rechargement.

1. Charger le visuel `dist/marmitonAssistant7E52235DDC224199B7B645E2E662ED14.1.0.4.0.pbiviz` dans Desktop. Si les ressources du PBIP sont déjà mises à jour, fermer le rapport sans enregistrer puis le rouvrir suffit.
2. Sur la page Assistant IA, cliquer sur **Se connecter**.
3. Dans le navigateur, confirmer **Autoriser et connecter**. Valider Microsoft si demandé. Une session Microsoft déjà validée côté serveur est réutilisée.
4. Revenir dans le rapport : le chat s'active automatiquement après détection de la connexion.

Les politiques de visuels personnalisés et les restrictions réseau de l'hôte peuvent bloquer le chargement ; une compilation réussie ne garantit pas son fonctionnement dans Desktop ou Service. Tester le parcours dans chaque hôte ciblé.

Le visuel utilise directement le DOM et des appels API, sans iframe imbriquée. Son jeton privé reste en mémoire et n'est pas inclus dans le lien du navigateur. Ce lien contient un ticket à usage unique, expirant après dix minutes, qui doit être confirmé dans le navigateur. Les connexions et historiques sont séparés par utilisateur. Une déconnexion révoque tous les visuels associés à la session.

Les jetons Microsoft et la clé Gemini restent dans le serveur et ne sont pas inclus dans le paquet. Une veille ou un redémarrage du service gratuit peut imposer une reconnexion. Une recréation du visuel perd aussi son jeton en mémoire : recliquer sur Se connecter. Le code éventuellement demandé par Microsoft reste une validation Microsoft, pas un code de jumelage à saisir dans le rapport.

Pour recompiler : `npm.cmd ci`, puis `npm.cmd run package -- --resources --skip-api`.
