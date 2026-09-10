CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
--> statement-breakpoint
CREATE TABLE products (
	id VARCHAR(60) NOT NULL,
	category VARCHAR(20) NOT NULL,
	name VARCHAR(100) NOT NULL,
	kind VARCHAR(100) NOT NULL,
	detail VARCHAR(160) NOT NULL,
	position INTEGER NOT NULL,
	PRIMARY KEY (id)
);
--> statement-breakpoint
CREATE TABLE scenarios (
	id UUID NOT NULL,
	month DATE NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
);
--> statement-breakpoint
CREATE TABLE assets (
	id UUID NOT NULL,
	scenario_id UUID NOT NULL,
	product_id VARCHAR(60) NOT NULL,
	available_from DATE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(scenario_id) REFERENCES scenarios (id),
	FOREIGN KEY(product_id) REFERENCES products (id)
);
--> statement-breakpoint
CREATE TABLE orders (
	id UUID NOT NULL,
	number VARCHAR(40) NOT NULL,
	scenario_id UUID NOT NULL,
	request_id UUID NOT NULL,
	request_hash VARCHAR(64) NOT NULL,
	first_name VARCHAR(60) NOT NULL,
	last_name VARCHAR(60) NOT NULL,
	email VARCHAR(160) NOT NULL,
	phone VARCHAR(25) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_order_request UNIQUE (scenario_id, request_id),
	UNIQUE (number),
	FOREIGN KEY(scenario_id) REFERENCES scenarios (id)
);
--> statement-breakpoint
CREATE TABLE order_lines (
	id UUID NOT NULL,
	order_id UUID NOT NULL,
	product_id VARCHAR(60) NOT NULL,
	quantity INTEGER NOT NULL,
	start_date DATE NOT NULL,
	end_exclusive DATE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_line_quantity CHECK (quantity BETWEEN 1 AND 6),
	CONSTRAINT ck_line_dates CHECK (start_date < end_exclusive),
	CONSTRAINT uq_order_product UNIQUE (order_id, product_id),
	FOREIGN KEY(order_id) REFERENCES orders (id),
	FOREIGN KEY(product_id) REFERENCES products (id)
);
--> statement-breakpoint
CREATE TABLE purchase_requests (
	id UUID NOT NULL,
	line_id UUID NOT NULL,
	quantity INTEGER NOT NULL,
	needed_by DATE NOT NULL,
	status VARCHAR(20) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_purchase_quantity CHECK (quantity > 0),
	CONSTRAINT ck_purchase_status CHECK (status = 'requested'),
	UNIQUE (line_id),
	FOREIGN KEY(line_id) REFERENCES order_lines (id)
);
--> statement-breakpoint
CREATE TABLE reservations (
	id UUID NOT NULL,
	asset_id UUID NOT NULL,
	line_id UUID NOT NULL,
	start_date DATE NOT NULL,
	end_exclusive DATE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_reservation_dates CHECK (start_date < end_exclusive),
	CONSTRAINT uq_asset_line UNIQUE (asset_id, line_id),
	CONSTRAINT no_asset_overlap EXCLUDE USING gist (asset_id WITH =, daterange(start_date, end_exclusive, '[)') WITH &&),
	FOREIGN KEY(asset_id) REFERENCES assets (id),
	FOREIGN KEY(line_id) REFERENCES order_lines (id)
);
--> statement-breakpoint
CREATE TABLE system_events (
	id UUID NOT NULL,
	order_id UUID NOT NULL,
	line_id UUID NOT NULL,
	type VARCHAR(40) NOT NULL,
	quantity INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT ck_event_quantity CHECK (quantity > 0),
	FOREIGN KEY(order_id) REFERENCES orders (id),
	UNIQUE (line_id),
	FOREIGN KEY(line_id) REFERENCES order_lines (id)
);
--> statement-breakpoint
CREATE INDEX ix_asset_scenario_product ON assets (scenario_id, product_id);
--> statement-breakpoint
CREATE INDEX ix_order_lines_order_id ON order_lines (order_id);
--> statement-breakpoint
CREATE INDEX ix_reservations_line_id ON reservations (line_id);
--> statement-breakpoint
CREATE INDEX ix_system_events_order_id ON system_events (order_id);
