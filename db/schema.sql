-- JAY STEEL JEWELRY — shop schema (Neon Postgres).
-- Run once against the database in DATABASE_URL:
--   psql "$DATABASE_URL" -f db/schema.sql
-- Money is stored as integer cents. A price is never stored as a float.

create table if not exists products (
  sku          text primary key,
  name         text        not null,
  price_cents  integer     not null check (price_cents >= 0),
  currency     char(3)     not null default 'USD',
  active       boolean     not null default true,
  stock        integer     check (stock is null or stock >= 0),
  image        text,
  description  text,
  sort_order   integer     not null default 100,
  updated_at   timestamptz not null default now()
);

create table if not exists orders (
  id              uuid        primary key,
  paypal_order_id text        unique not null,
  status          text        not null default 'created'
                              check (status in ('created','paid','amount_mismatch','cancelled','refunded')),
  total_cents     integer     not null check (total_cents >= 0),
  currency        char(3)     not null default 'USD',
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);

create table if not exists order_items (
  order_id         uuid    not null references orders(id) on delete cascade,
  sku              text    not null,
  name             text    not null,
  qty              integer not null check (qty > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  primary key (order_id, sku)
);

create index if not exists orders_status_created_idx on orders (status, created_at desc);
create index if not exists order_items_sku_idx on order_items (sku);

-- The server reads products through this view so a rename of a column happens in one place.
create or replace view public_products as
  select sku, name, price_cents, currency, stock, image, description, sort_order
    from products
   where active = true
   order by sort_order, name;
