# ⚡ RemYA - Assistant IA Personnel

RemYA est un assistant IA local et personnel qui utilise Ollama pour le traitement du langage naturel et peut interagir avec ton PC.

## 🚀 Démarrage rapide

### Prérequis

1. **Node.js** (v18+) - [Télécharger](https://nodejs.org/)
2. **Ollama** - [Télécharger](https://ollama.ai/)

### Installation

```bash
# 1. Installer Ollama et télécharger un modèle
ollama pull llama3.2:1b

# 2. Lancer Ollama
ollama serve

# 3. Installer les dépendances du backend
cd server
npm install

# 4. Lancer le backend RemYA
npm start
# ou sur Windows: double-cliquer sur start-server.bat
```

### Accès

- **Frontend**: http://localhost/saralab/remya/ (via Laragon)
- **Backend**: http://localhost:3456

## ✨ Fonctionnalités

### Chat IA
- 💬 Interface de chat moderne et responsive
- 🔄 Streaming des réponses en temps réel
- 📝 Support Markdown complet avec coloration syntaxique
- 💾 Persistance des conversations (localStorage)
- 🔍 Recherche dans l'historique
- 📋 Copier/Régénérer les réponses

### Interactions Système (via Backend)
- 📁 **Fichiers**: Lister, lire, créer, supprimer
- ⚡ **Commandes**: Exécuter des commandes système
- 🖥️ **Apps**: Ouvrir des applications
- 📋 **Clipboard**: Lire/écrire le presse-papier
- 🌐 **Web**: Fetch et extraction de contenu

### Interface
- 🌙/☀️ Thème sombre/clair
- ⌨️ Raccourcis clavier
- 📱 Responsive design
- 🎨 Design moderne avec gradients

## ⌨️ Raccourcis

| Raccourci | Action |
|-----------|--------|
| `Ctrl+K` | Palette de commandes |
| `Ctrl+N` | Nouvelle conversation |
| `Ctrl+T` | Changer de thème |
| `Enter` | Envoyer le message |
| `Shift+Enter` | Nouvelle ligne |
| `/` | Focus sur l'input |
| `Escape` | Fermer les modals |

## 🔌 API Backend

### Health Check
```http
GET /health
```

### Fichiers
```http
POST /api/files/list     # Lister un dossier
POST /api/files/read     # Lire un fichier
POST /api/files/write    # Écrire un fichier
POST /api/files/mkdir    # Créer un dossier
POST /api/files/delete   # Supprimer
POST /api/files/search   # Rechercher
```

### Système
```http
GET  /api/system/info       # Infos système
POST /api/system/exec       # Exécuter commande
POST /api/system/open       # Ouvrir une app
POST /api/system/open-url   # Ouvrir une URL
GET  /api/system/clipboard  # Lire clipboard
POST /api/system/clipboard  # Écrire clipboard
GET  /api/system/processes  # Liste processus
GET  /api/system/disk       # Espace disque
```

### Web
```http
POST /api/web/fetch   # Fetch une page
POST /api/web/links   # Extraire les liens
POST /api/web/check   # Vérifier URL
```

## 📁 Structure du projet

```
remya/
├── index.html           # Page principale
├── css/
│   └── style.css        # Styles
├── js/
│   ├── app.js           # Application principale
│   ├── api.js           # Communication API
│   ├── ui.js            # Gestion de l'interface
│   └── storage.js       # Persistance localStorage
├── server/
│   ├── package.json     # Dépendances Node.js
│   ├── server.js        # Serveur Express
│   └── routes/
│       ├── files.js     # Routes fichiers
│       ├── system.js    # Routes système
│       └── web.js       # Routes web
├── start-server.bat     # Lancer le serveur (Windows)
└── README.md
```

## 🛡️ Sécurité

- Les commandes système sont filtrées en mode "safe"
- Seuls certains dossiers sont accessibles
- Les commandes dangereuses sont bloquées

## 🔧 Configuration

Les paramètres sont accessibles via l'icône ⚙️ dans la sidebar :
- URL Ollama (défaut: http://localhost:11434)
- URL Backend (défaut: http://localhost:3456)
- Nom d'utilisateur
- Options d'interface

## 📜 Licence

MIT - Fait avec ❤️ par Rémy
