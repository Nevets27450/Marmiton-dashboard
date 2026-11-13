# Assistant Marmiton dans Power BI Desktop — serveur HTTPS

Le visuel 1.0.3 pointe vers https://marmiton-assistant.onrender.com. Aucun serveur Node local n'est nécessaire pour cette version. Le serveur utilise le modèle publié dans Power BI Service. Les filtres du rapport ne sont pas transmis au chat. L'affichage et le parcours complet dans Desktop restent à vérifier après rechargement.

1. Ouvrir https://marmiton-assistant.onrender.com et connecter Power BI.
2. Afficher le code sous « Connecter le visuel Power BI Desktop ».
3. Dans Power BI Desktop, volet Visualisations → … → Importer un visuel à partir d'un fichier. Choisir `dist/marmitonAssistant7E52235DDC224199B7B645E2E662ED14.1.0.3.0.pbiviz`. Si les ressources du PBIP sont déjà mises à jour, fermer le rapport sans enregistrer puis le rouvrir suffit.
4. Sur la page Assistant IA, ajouter le visuel importé et l'agrandir. Il ne demande aucun champ de données.
5. Enregistrer le projet PBIP afin que Desktop enregistre aussi les ressources du visuel.

L'import et l'affichage ne sont pas encore vérifiés dans Desktop. Les politiques de visuels personnalisés, le bac à sable et les restrictions d'accès au serveur local peuvent bloquer le chargement ; une compilation réussie ne garantit pas son fonctionnement dans l'hôte. Ne pas publier ce prototype comme assistant destiné aux lecteurs Power BI Service.

Le visuel 1.0.1 utilise directement le DOM et des appels API, sans iframe imbriquée. Dans le navigateur local, ouvrir « Connecter le visuel Power BI Desktop », afficher le code de jumelage, puis le coller dans le visuel. Ce code aléatoire reste en mémoire, change au redémarrage du serveur et n'est jamais inclus dans le paquet ni enregistré dans le rapport. Le serveur autorise seulement status/chat/reset depuis l'origine opaque du visuel avec ce code ; les opérations de connexion Microsoft restent réservées au navigateur local.

Le bouton Connexion Microsoft ouvre le site hébergé ; revenir au rapport après la connexion et copier le code dans le champ de jumelage. Les jetons Microsoft et la clé Gemini restent dans le serveur et ne sont pas inclus dans le paquet. Une veille ou un redémarrage du service gratuit peut imposer une reconnexion.

Pour recompiler : `npm.cmd ci`, puis `npm.cmd run package -- --resources --skip-api`.
