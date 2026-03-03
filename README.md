# NewsRead — Conflit USA/Israël vs Iran

Lecteur RSS qui agrège 10 flux d’actualités, filtre avec l’IA OpenAI les articles liés au conflit USA/Israël vs Iran, et affiche un résumé avec sélecteur de période (1 h, 6 h, 12 h, 24 h, 48 h). Interface noir et or.

## Prérequis

- Node.js 20+
- Clé API OpenAI

## Installation

```bash
npm install
cp .env.example .env
# Éditer .env et mettre votre OPENAI_API_KEY
```

## Lancement

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Utilisation

1. Choisir une période avec les boutons **1 h**, **6 h**, **12 h**, **24 h** ou **48 h**.
2. L’app récupère les derniers articles des 10 flux RSS, les envoie à l’IA pour ne garder que ceux sur le conflit USA/Israël vs Iran, puis affiche un résumé et la liste des articles retenus.

## Flux RSS (10 sites)

BBC News, CNN, Al Jazeera, The Guardian, France 24, DW, NYT World, Washington Post, NPR News, ABC News.
