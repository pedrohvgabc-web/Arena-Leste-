-- WMS / PDV Arena Leste
create table if not exists public.wms_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.wms_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.wms_categories(id),
  name text not null,
  sku text not null unique,
  barcode text unique,
  unit text not null default 'un',
  sale_price_cents integer not null default 0 check (sale_price_cents >= 0),
  cost_price_cents integer not null default 0 check (cost_price_cents >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  reorder_point integer not null default 0 check (reorder_point >= 0),
  is_rental boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wms_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.wms_products(id) on delete cascade,
  previous_sale_price_cents integer not null,
  new_sale_price_cents integer not null,
  previous_cost_price_cents integer not null,
  new_cost_price_cents integer not null,
  reason text,
  changed_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wms_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  role text not null check (role in ('admin_remote','caixa_local')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.wms_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.wms_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wms_sales (
  id uuid primary key default gen_random_uuid(),
  sale_number bigint generated always as identity unique,
  operator_id text not null,
  channel text not null default 'counter' check (channel in ('counter','comanda')),
  payment_method text check (payment_method in ('pix','card','cash','pending')),
  status text not null default 'completed' check (status in ('completed','cancelled','pending')),
  total_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.wms_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.wms_sales(id) on delete cascade,
  product_id uuid not null references public.wms_products(id),
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null,
  unit_cost_snapshot_cents integer not null,
  total_cents integer not null
);

create table if not exists public.wms_stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.wms_products(id),
  movement_type text not null check (movement_type in ('purchase_entry','sale','manual_adjustment','return','rental_checkout','rental_return','loss','inventory_count')),
  quantity integer not null,
  previous_quantity integer not null,
  new_quantity integer not null check (new_quantity >= 0),
  reference_id uuid,
  reason text,
  performed_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wms_rentals (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.wms_products(id),
  customer_name text not null,
  court text,
  quantity integer not null default 1 check (quantity > 0),
  status text not null default 'active' check (status in ('active','returned','lost','damaged')),
  operator_id text not null,
  checked_out_at timestamptz not null default now(),
  returned_at timestamptz
);

create index if not exists wms_products_barcode_idx on public.wms_products(barcode);
create index if not exists wms_stock_movements_product_idx on public.wms_stock_movements(product_id, created_at desc);
create index if not exists wms_sales_created_idx on public.wms_sales(created_at desc);

insert into public.wms_categories (name) values
  ('Bebidas'), ('Isotônicos'), ('Açaí'), ('Artigos de vôlei'), ('Protetor solar'), ('Vestuário'), ('Aluguel')
on conflict (name) do nothing;
