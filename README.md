Gemini said
🛡️ SafeRoute AI: Safety-First Navigation System
📌 Project Overview
SafeRoute AI is a navigation enhancement system designed for individuals traveling alone or in unfamiliar areas. While traditional GPS apps like Google Maps or Waze prioritize the fastest or shortest path, SafeRoute AI prioritizes the safest path.

The system analyzes real-time environmental data—such as lighting, human activity, and road infrastructure—to calculate a safety index for every available route, helping users make informed decisions about their journey.

🚀 Key Features
Safety-Weighted Routing: Recommends paths based on a multi-factor safety score rather than just speed.

Real-time Crowd Estimation: Uses POI (Point of Interest) density to determine "eyes on the street" (human presence).

Infrastructure Analysis: Detects street lighting tags and road classifications via OpenStreetMap.

Dynamic Safety Visualization: Routes are color-coded (🟢 Green, 🟡 Yellow, 🔴 Red) based on their calculated risk level.

Spatial Sampling: High-performance algorithm that evaluates safety at 300m intervals along a path.

🧠 The Safety Scoring Logic
The system evaluates each route using a weighted algorithm. The score is calculated by sampling coordinates along the path and querying environmental metadata for each point.

⚖️ Weight Distribution
Factor	Weight	Description
Lighting	45%	Presence of streetlights or "lit" tags in map data.
Crowd Density	35%	Proximity to open businesses (cafes, shops, transit hubs).
Road Type	20%	Preference for main roads over isolated alleys or unclassified paths.
📐 The Formula
Safety Score=(0.45×L)+(0.35×C)+(0.20×R)
Where L = Lighting, C = Crowd Density, and R = Road Infrastructure Score.

🛠️ Technical Stack
Frontend: React.js / Next.js

Mapping: Mapbox GL JS / Leaflet

Routing: OpenRouteService API / Mapbox Directions

Safety Data: Overpass API (OpenStreetMap)

Styling: Tailwind CSS

🏗️ System Architecture
Route Generation: User inputs source and destination; the system fetches multiple route geometries.

Point Sampling: The geometry is broken down into segments (one point every 300 meters).

Data Extraction: For each point, the system sends an asynchronous query to the Overpass API to find nearby POIs and lighting info.

Scoring Engine: The raw data is normalized (0 to 1) and passed through the weighted formula.

Visualization: The frontend renders the routes on the map with custom colors reflecting the safety percentage.
