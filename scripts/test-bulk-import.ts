
import { insertClientSchema } from '../shared/schema';
import { z } from 'zod';

// Config
const API_URL = 'http://localhost:5000/api/clients/bulk'; // Adaptez le port si nécessaire
const AGENCE_ID = 'e1a351eb-058f-40e9-9069-c6e3d2315264'; // ID Agence Demo (Siège)
// Note: Pour ce script, nous supposons que l'authentification est gérée ou mockée, 
// ou nous utilisons un cookie de session existant si nécessaire.
// Pour simplifier ce test "backend", nous allons mocker fetch ou utiliser un token si dispo.
// MAIS le prompt demande un script "autonome". Si l'API est protégée (requireAuth), ce script échouera sans cookie.
// On va supposer que l'utilisateur lance ça dans un environnement où il peut soit désactiver l'auth temporairement, 
// soit on simule une session.
// 
// Alternative: Ce script peut utiliser directement le storage si on l'exécute via `tsx` en important le storage, 
// MAIS le prompt demande "Envoie une requête POST vers l'endpoint local".
// Donc il faut une session.
//
// Pour faire simple et robuste : On va utiliser le `storage` directement pour le test unitaire "Backend Logic",
// ET on va essayer le fetch si le serveur tourne. 
// Mais attend... "Créer un script autonome qui... Envoie une requête POST".
// Je vais simuler un cookie de session hardcodé ou juste faire un login avant ?
// Trop complexe pour un simple test script rapide.
// 
// MIEUX : On va importer l'app express et supertest ? Non, il faut que le serveur tourne.
//
// Décision : On va essayer de faire un login d'abord (si possible) ou demander à l'utilisateur de fournir un cookie.
// OU : On utilise faker pour générer les données et on les log pour que l'utilisateur puisse les tester via curl/Postman.
// 
// NON, le prompt dit : "Génère 50 clients... Envoie une requête... Affiche le temps".
// Je vais tenter de faire un login avec 'admin' / 'admin' (compte par défaut seedé) pour récupérer un cookie.

async function runTest() {
  console.log("🚀 Démarrage du test Bulk Import...");

  // 1. Génération de données
  const clients = [];
  for (let i = 0; i < 50; i++) {
    clients.push({
      nom: `TestBulk ${Date.now()}_${i}`,
      prenom: `Client ${i}`,
      email: `bulk_test_${Date.now()}_${i}@example.com`,
      telephone: `+24206${Math.floor(1000000 + Math.random() * 9000000)}`,
      adresse: '123 Rue de Test',
      status: 'Actif',
      segment: 'Standard',
      agenceId: AGENCE_ID
    });
  }

  console.log(`📦 Payload généré : ${clients.length} clients.`);

  // 2. Login pour avoir le cookie
  console.log("🔑 Tentative de connexion (admin)...");
  let cookie = '';
  try {
      const loginRes = await fetch('http://localhost:5000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 's.administrateur', password: 'password123' }) // Mots de passe par défaut seed-demo
      });
      
      if (!loginRes.ok) {
          throw new Error(`Login failed: ${loginRes.status}`);
      }
      
      const setCookie = loginRes.headers.get('set-cookie');
      if (setCookie) {
          cookie = setCookie;
          console.log("✅ Connexion réussie, cookie récupéré.");
      } else {
        console.warn("⚠️ Pas de cookie reçu, le test risque d'échouer (401).");
      }

  } catch (e) {
      console.error("❌ Erreur Login (le serveur est-il lancé sur 5000 ?):", e);
      return;
  }

  // 3. Envoi Bulk
  console.log("📤 Envoi de la requête Bulk...");
  const start = performance.now();

  try {
      const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              'Cookie': cookie
          },
          body: JSON.stringify(clients)
      });

      const end = performance.now();
      const duration = (end - start).toFixed(2);

      if (res.ok) {
          const json = await res.json();
          console.log(`✅ Succès !`);
          console.log(`⏱️ Temps d'exécution : ${duration} ms pour ${clients.length} clients.`);
          console.log(`📊 Résultat :`, json);
      } else {
          console.error(`❌ Erreur API : ${res.status} ${res.statusText}`);
          const text = await res.text();
          console.error("Réponse:", text);
      }

  } catch (e) {
      console.error("❌ Erreur Réseau :", e);
  }
}

runTest();
