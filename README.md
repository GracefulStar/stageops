# StageOps

StageOps - demonstration rental service for stage equipment with a focus on backend logic: rental calendar, inventory state, physical asset reservations, and automatic internal purchase requests when stock is insufficient.

The user builds an order in the interface, chooses dates for the whole cart or for individual items, and receives an order number. The server decides which physical equipment units can be assigned and which items require an internal operator request.

[Live demo](https://stageops-rental.kiriyama-issa.chatgpt.site)

## What This Project Shows

**Python / FastAPI / PostgreSQL / SQLAlchemy 2 / Alembic / pytest / React / TypeScript**

- Domain modeling: catalog, physical assets, orders, reservations, shortage events, and purchase requests.
- Transactional order creation: the order is saved completely or not saved at all.
- Date-based allocation logic with overlapping rental periods.
- Race-condition protection: row-level locking and a PostgreSQL `EXCLUDE` constraint against double-booking one physical unit.
- Idempotency key support to prevent duplicate orders after repeated form submission.
- Server-side validation for contacts, quantities, and rental dates.
- A polished React interface that demonstrates the backend rules through a complete user flow.

### Live Demo Status

[StageOps live demo](https://stageops-rental.kiriyama-issa.chatgpt.site) runs on the original TypeScript + D1 prototype. It is not a hosted Python server. The full Python/FastAPI/PostgreSQL version is included in this repository and can be run locally.

## Local Run

```sh
docker compose up --build
```
