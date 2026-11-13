# Assistant Marmiton dans Power BI Desktop — serveur HTTPS

Le visuel 1.0.6 pointe vers https://marmiton-assistant.onrender.com et se connecte sans copie de code de jumelage. Aucun serveur Node local n'est nécessaire. Le serveur utilise le modèle publié dans Power BI Service. Les filtres du rapport ne sont pas transmis au chat. Le parcours complet dans Desktop reste à vérifier après rechargement.

1. Charger le visuel `dist/marmitonAssistant7E52235DDC224199B7B645E2E662ED14.1.0.6.0.pbiviz` dans Desktop. Si les ressources du PBIP sont déjà mises à jour, fermer le rapport sans enregistrer puis le rouvrir suffit.
2. Sur la page Assistant IA, cliquer sur **Se connecter**.
3. Dans le navigateur, confirmer **Autoriser et connecter**. Valider Microsoft si demandé. Une session Microsoft déjà validée côté serveur est réutilisée.
4. Revenir dans le rapport : le chat s'active automatiquement après détection de la connexion.

Les politiques de visuels personnalisés et les restrictions réseau de l'hôte peuvent bloquer le chargement ; une compilation réussie ne garantit pas son fonctionnement dans Desktop ou Service. Tester le parcours dans chaque hôte ciblé.

Le visuel utilise directement le DOM et des appels API, sans iframe imbriquée. Son jeton privé reste en mémoire et n'est pas inclus dans le lien du navigateur. Ce lien contient un ticket à usage unique, expirant après dix minutes, qui doit être confirmé dans le navigateur. Les connexions et historiques sont séparés par utilisateur. Une déconnexion révoque tous les visuels associés à la session.

Le visuel déclare le privilège facultatif LocalStorage et utilise uniquement storageV2Service quand l'hôte le permet. Il mémorise le jeton révocable du visuel, son expiration et l'identifiant de conversation dans le stockage privé isolé par utilisateur et type de visuel. Aucun jeton Microsoft, clé Gemini ou message du chat n'y est enregistré. Aucune propriété du rapport ne contient de secret. À la recréation du visuel, la connexion est vérifiée auprès du serveur avant activation du chat. Un refus de stockage n'est jamais contourné ; dans ce cas, une reconnexion peut rester nécessaire après navigation.

Après reprise de session, les 50 derniers échanges terminés sont relus sur le serveur et réaffichés (questions, réponses, résultats et avertissements), sans appel à Gemini ni calcul Power BI supplémentaire. Les remerciements sont conservés à l'écran sans remplacer les six tours de contexte analytique. Une réponse interrompue avant validation n'est pas enregistrée. Nouvelle conversation efface la discussion courante ; une expiration ou un redémarrage du serveur efface aussi l'historique en mémoire.

Une expiration, une déconnexion ou un redémarrage du serveur peuvent imposer une reconnexion. Le code éventuellement demandé par Microsoft reste une validation Microsoft, pas un code de jumelage à saisir dans le rapport.

Pour recompiler : `npm.cmd ci`, puis `npm.cmd run package -- --resources --skip-api`.
