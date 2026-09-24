# fishi-todo-manager

Stefans persönlicher Todo-Manager, deployed auf [fishi.dev](https://fishi.dev).

## Was es kann
- **Web-UI** unter `/` mit Token-Login: zeigt „Jetzt dran", offene und erledigte Todos, Anlegen/Löschen/Abhaken.
- **Offene JSON-API** unter `/api/*`, geschützt durch einen fixen Token (Bearer / `x-api-token` / `?token=`).
- **`/agents.txt`** — öffentliche Anleitung für KI-Agenten: Auth, Datenmodell, Routen, Sortierung, Verhaltensregeln.

## Routen
| Route | Methode | Zweck |
|---|---|---|
| `/` | GET | Web-UI (Login-Formular ohne Token) |
| `/login` | POST | Token-Login (Cookie) |
| `/agents.txt` | GET | öffentliche Agenten-Anleitung |
| `/api/health` | GET | Health-Check (öffentlich) |
| `/api/todos` | GET/POST | Liste / Neu anlegen |
| `/api/next` | GET | die wichtigsten offenen Todos |
| `/api/todos/:id` | GET/PATCH/DELETE | Detail / Ändern / Löschen |
| `/api/todos/:id/done` | POST | als erledigt markieren |

## Deployment (Bootstrap)

Der API-Token ist absichtlich NICHT im Repo. Beim Deploy wird der Platzhalter
`__TOKEN__` in `index.js` durch den echten Token ersetzt:

```bash
sed "s/__TOKEN__/DEIN-TOKEN/" index.js > /tmp/index.js
curl -sS -X POST https://fishi.dev/ship \
  -H "Content-Type: application/javascript" \
  --data-binary @/tmp/index.js
# expect: status=running
```

Die Ship-Antwort enthält `app.url` (die öffentliche Adresse), `token` (fishi-Deplopy-Token — einmalig angezeigt, speichern!) und `claim_url` (App dauerhaft beanspruchen, sonst wird sie nach 7 Tagen ohne Traffic gelöscht).

## Lokal

Nicht lokal ausführen — `express` und `better-sqlite3` sind nur in fishi vorinstalliert (siehe fishi-Doku).
