# Marmiton Dashboard

Projet Power BI au format PBIP : analyse des recettes, ingrédients et avis Marmiton.

## Ouvrir le rapport

Ouvrir `Marmiton Dashboard.pbip` dans Power BI Desktop en conservant les dossiers `.Report` et `.SemanticModel` à ses côtés. Les données et caches ne sont pas versionnés ; l’actualisation des sources SharePoint nécessite les autorisations appropriées.

## Versions

- `v1.0` : modèle avant optimisation et rapport avant les modifications de design, reconstitués depuis les sauvegardes. Les fichiers de projet nécessaires à l’ouverture proviennent de l’enregistrement PBIP disponible.
- `v2.0` : modèle optimisé, graphiques en pourcentages, accueil et pages Aperçu / Infos remaniés.

Les pourcentages utilisent le total de toutes les recettes du modèle. Chaque ingrédient est compté en nombre de recettes distinctes ; leurs pourcentages ne s’additionnent donc pas à 100 %.

Les sauvegardes locales, caches Power BI et exports binaires sont exclus de Git.

## Assistant IA

Le dossier [assistant](assistant/README.md) contient le serveur Node.js et le code du visuel conversationnel. La page Assistant IA intègre le visuel connecté au service HTTPS hébergé sur Render. Le serveur interroge le modèle publié dans Power BI Service avec les droits du compte connecté. Le déploiement est décrit dans [assistant/DEPLOYMENT.md](assistant/DEPLOYMENT.md).
