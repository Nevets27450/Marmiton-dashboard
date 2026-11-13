# Assistant Marmiton — prototype local et préparation hébergée

Node.js 22 ou plus récent. Aucune dépendance à installer.

## Démarrage

1. Copier `.env.example` en `.env` si `.env` n'existe pas.
2. Renseigner `GEMINI_API_KEY` uniquement dans `.env`. Ne pas envoyer cette clé dans le chat ni la committer.
3. Vérifier dans Google AI Studio que le modèle choisi dispose d'un quota gratuit pour le projet. Le serveur n'active ni facturation ni fallback, mais ne peut pas détecter la facturation du compte Google.
4. Dans PowerShell :

```powershell
cd "H:\Documents\Agentic BI\assistant"
npm start
```

5. Ouvrir **http://127.0.0.1:8787** (utiliser cette adresse, pas `localhost`).
6. Cliquer sur **Connecter Power BI**, puis valider le code Microsoft avec le compte universitaire autorisé sur le modèle.
7. Poser une question, puis préciser les critères au message suivant : « et sans note ? ». Les six derniers échanges terminés sont conservés en mémoire. « Nouvelle conversation » réinitialise ce contexte.

Une modification de `.env` nécessite un redémarrage. Le jeton Microsoft est gardé en mémoire, sans cache persistant ; une nouvelle connexion est nécessaire après expiration ou redémarrage. Pour arrêter le serveur : Ctrl+C. Le déploiement HTTPS sur Render est décrit dans [DEPLOYMENT.md](DEPLOYMENT.md).

## Architecture et limites

- Gemini traduit la question en paramètres JSON validés. Le serveur construit le DAX à partir de modèles fixes en lecture seule.
- Gemini reçoit la question, le contexte récent et les règles de calcul pour préparer le plan. Un second appel, diffusé en streaming réel, reçoit les résultats agrégés pour rédiger une réponse naturelle. Aucun jeton Microsoft ni clé n'est envoyé dans les messages. Le tableau « Résultats vérifiés » reste la référence chiffrée. Les conditions du quota gratuit Google s'appliquent aux questions et aux résultats transmis.
- En cas d'échec ou de quota lors de la rédaction, la prose partielle est remplacée par une réponse déterministe à partir des chiffres obtenus. L'utilisateur peut arrêter le flux ; les requêtes réseau sont annulées autant que possible et les échanges incomplets ne sont pas ajoutés à l'historique. Les appels déjà exécutés peuvent consommer du quota.
- Les pourcentages ont pour dénominateur toutes les recettes du modèle. Les ingrédients sont comptés par recette distincte.
- Opérations : compter les recettes, filtrer les notes et durées, répartition par durée, présence d'un ingrédient exact, principaux ingrédients, classement par score parmi les recettes notées 5.
- La reconnaissance des ingrédients est exacte sur le nom normalisé. Les synonymes et fautes peuvent donner zéro résultat.
- Les commentaires textuels, filtres interactifs du rapport et RAG ne sont pas encore intégrés. La mémoire courte de la conversation n'est pas une récupération exhaustive d'anciens échanges.
- Le modèle publié peut différer des fichiers PBIP non republiés : la réponse reflète Power BI Service au moment du calcul.
- Chaque navigateur possède sa connexion Power BI, son historique et son code de jumelage séparés. Les sessions restent en mémoire pour une seule instance et expirent après huit heures. Le mode local écoute uniquement sur 127.0.0.1 ; le mode hébergé exige une origine HTTPS configurée et vérifie l'accès au modèle avant d'autoriser le chat.
- La page Assistant IA contient le visuel natif du chat, sans iframe imbriquée. Le paquet est compilé dans `powerbi-visual/dist/`. Le clic Envoyer a été corrigé pour ne pas dépendre des formulaires bloqués par le bac à sable. La version hébergée reste à déployer et à tester avec l'URL HTTPS réelle ; un compte personnel Microsoft n'obtient pas automatiquement les droits Power BI.

## Passer ensuite à Ollama

Après installation locale du modèle choisi, modifier `.env` :

```dotenv
LLM_PROVIDER=ollama
OLLAMA_MODEL=qwen3:8b
```

Le backend contacte uniquement `http://127.0.0.1:11434`. Les mêmes validations et requêtes DAX sont conservées. Cette intégration est prévue dans le code mais doit être testée avec le modèle et le matériel réels.

## Vérifications

```powershell
npm test
```

Les tests n'appellent ni Google ni Microsoft. Tester ensuite avec les connexions réelles, notamment : total, notes vides, note 5, filtre durée, ingrédient, et comparaison avec les KPI. Les métadonnées de plan ne constituent pas une preuve de bonne interprétation : le périmètre affiché doit être vérifié.

`node check-live-planner.mjs` teste facultativement deux interprétations avec le fournisseur configuré : une durée, puis « et sans note ? ». Ces deux appels consomment du quota. Après une mise à jour du serveur, arrêter Node (Ctrl+C), relancer `node server.mjs`, recharger la page, puis reconnecter Power BI.
