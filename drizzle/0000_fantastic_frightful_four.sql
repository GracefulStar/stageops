CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`product_id` text NOT NULL,
	`available_from` text NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_assets_scenario_product` ON `assets` (`scenario_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_exclusive` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "line_quantity_positive" CHECK("order_lines"."quantity" > 0),
	CONSTRAINT "line_dates_ordered" CHECK("order_lines"."start_date" < "order_lines"."end_exclusive")
);
--> statement-breakpoint
CREATE INDEX `idx_order_lines_order` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`scenario_id` text NOT NULL,
	`request_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_orders_number` ON `orders` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_orders_scenario_request` ON `orders` (`scenario_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `purchase_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`line_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`needed_by` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`line_id`) REFERENCES `order_lines`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_quantity_positive" CHECK("purchase_requests"."quantity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_purchases_line` ON `purchase_requests` (`line_id`);--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` text NOT NULL,
	`line_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_exclusive` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`line_id`) REFERENCES `order_lines`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reservation_dates_ordered" CHECK("reservations"."start_date" < "reservations"."end_exclusive")
);
--> statement-breakpoint
CREATE INDEX `idx_reservations_asset_dates` ON `reservations` (`asset_id`,`start_date`,`end_exclusive`);--> statement-breakpoint
CREATE INDEX `idx_reservations_line` ON `reservations` (`line_id`);--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`line_id` text NOT NULL,
	`type` text NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`line_id`) REFERENCES `order_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_order` ON `system_events` (`order_id`);