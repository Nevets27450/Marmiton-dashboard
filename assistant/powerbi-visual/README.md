# Assistant Marmiton dans Power BI Desktop

Prototype local compilé, à valider dans Power BI Desktop. Le serveur utilise le modèle publié dans Power BI Service. Les filtres du rapport ne sont pas transmis au chat.

1. Dans PowerShell, lancer le serveur (ou arrêter l'ancien avec Ctrl+C avant de le relancer) :
   ```powershell
   cd 'H:\Documents\Agentic BI\assistant'
   node server.mjs
   ```
2. Ouvrir http://127.0.0.1:8787/ et connecter Power BI.
3. Dans Power BI Desktop, volet Visualisations → … → Importer un visuel à partir d'un fichier. Choisir `dist/marmitonAssistant7E52235DDC224199B7B645E2E662ED14.1.0.2.0.pbiviz`.
4. Sur la page Assistant IA, ajouter le visuel importé et l'agrandir. Il ne demande aucun champ de données.
5. Enregistrer le projet PBIP afin que Desktop enregistre aussi les ressources du visuel.

L'import et l'affichage ne sont pas encore vérifiés dans Desktop. Les politiques de visuels personnalisés, le bac à sable et les restrictions d'accès au serveur local peuvent bloquer le chargement ; une compilation réussie ne garantit pas son fonctionnement dans l'hôte. Ne pas publier ce prototype comme assistant destiné aux lecteurs Power BI Service.

Le visuel 1.0.1 utilise directement le DOM et des appels API, sans iframe imbriquée. Dans le navigateur local, ouvrir « Connecter le visuel Power BI Desktop », afficher le code de jumelage, puis le coller dans le visuel. Ce code aléatoire reste en mémoire, change au redémarrage du serveur et n'est jamais inclus dans le paquet ni enregistré dans le rapport. Le serveur autorise seulement status/chat/reset depuis l'origine opaque du visuel avec ce code ; les opérations de connexion Microsoft restent réservées au navigateur local.

Le bouton Connexion Microsoft ouvre le navigateur local ; revenir au rapport après la connexion. Le serveur doit rester ouvert pendant la conversation. Les jetons Microsoft et la clé Gemini restent dans le serveur et ne sont pas inclus dans le paquet.

Pour recompiler : `npm.cmd ci`, puis `npm.cmd run package -- --resources --skip-api`.
