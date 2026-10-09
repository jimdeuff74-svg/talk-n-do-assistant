# Mode « JD Raspberry Pi headless »

## Analyse de l'existant
- **Réponses IA** : `askJD` (fonction serveur) appelle le modèle, gère recherche web / YouTube et renvoie `{ reply, action, videoId }` au navigateur.
- **Voix** : dans le navigateur via `speechSynthesis` (voix de l'ordinateur). Pour le Pi, il existe déjà une route `/api/public/tts` qui génère un WAV voix d'homme (Charon) côté serveur — mais **elle est publique et non protégée** : elle sera supprimée et remplacée.
- **Lien Pi actuel** : le navigateur pousse une URL vers le tunnel Cloudflare du Pi. Fragile (tunnel qui change, CORS, navigateur obligatoire). Remplacé par une file d'attente que le Pi vient lire lui-même.
- **Base de données** : aucune aujourd'hui → activation de Lovable Cloud.

## Ce qui change
1. **File de messages** : une table stocke chaque réponse de JD destinée au Pi. Le Pi la récupère **une seule fois** (réservation atomique, pas de doublon même si deux requêtes arrivent ensemble).
2. **Le navigateur continue de marcher pareil.** Le choix « Sortie audio » devient : ÉCRAN / RASPBERRY / LES DEUX. En mode Raspberry, chaque réponse est ajoutée à la file au lieu d'être poussée au tunnel.
3. **Mode 100 % headless** : le Pi peut aussi poser lui-même une question (texte issu de son micro) et recevoir la réponse, sans aucun navigateur ouvert.
4. **Voix côté serveur** : le Pi télécharge un WAV prêt à jouer (voix d'homme), ou lit le texte avec son propre moteur (espeak/piper) s'il préfère.
5. **Sécurité** : un jeton secret propre au Pi (saisi via formulaire sécurisé, jamais dans le code ni le site). Chaque endpoint vérifie le jeton ; sans lui → 401. Table fermée à tout accès direct depuis le site.

## Endpoints (tous exigent `Authorization: Bearer <PI_DEVICE_TOKEN>`)

```text
GET  /api/public/pi/next          -> 200 {message} ou 204 si rien
GET  /api/public/pi/audio/<id>    -> audio/wav du message
POST /api/public/pi/ask {"text"}  -> 200 {message}  (pose une question à JD)
POST /api/public/pi/ack {"id"}    -> 200 {ok:true}  (confirmation de lecture, optionnel)
```

Format d'un message :
```json
{ "id": "uuid", "text": "Bonjour monsieur.", "created_at": "2026-10-09T19:40:00Z",
  "audio_url": "https://<site>/api/public/pi/audio/uuid" }
```

## Livrables
- Documentation `PI.md` : URL exacte (adresse publiée), format JSON, authentification, commandes curl, et un petit script Python pour le Pi (boucle : `next` → télécharge WAV → `aplay` sur la sortie jack).
- Tests : curl sans jeton (401), avec jeton (204 puis 200 après une question), double lecture (le 2e appel renvoie 204).
- L'intégration ne sera annoncée comme terminée qu'après **publication** et tests curl sur l'adresse publiée.

## Détails techniques
- Table `pi_messages(id uuid, text, source 'browser'|'pi', created_at, claimed_at, played_at)` avec RLS activée et **aucune policy** ; accès uniquement depuis les routes serveur après vérification du jeton (client admin chargé dans le handler).
- Fonction SQL `claim_next_pi_message()` : `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, exécutable uniquement par service_role.
- Comparaison du jeton en temps constant ; texte limité à 1000 caractères ; audio généré à la demande avec le modèle TTS déjà utilisé.
- La logique de `askJD` est extraite dans un module serveur partagé, réutilisé par la fonction du navigateur et par `/pi/ask`.
- Ajout à la file depuis le navigateur via une fonction serveur dédiée (texte uniquement, bornée en taille).
- Suppression de `/api/public/tts` et de l'appel direct au tunnel Cloudflare.
