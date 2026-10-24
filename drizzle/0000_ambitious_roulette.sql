CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slots` (
	`id` text PRIMARY KEY NOT NULL,
	`starts_at` integer NOT NULL,
	`duration` integer NOT NULL,
	`booked_at` integer,
	`guest_name` text,
	`guest_email` text,
	CONSTRAINT "duration_range" CHECK("slots"."duration" between 1 and 60),
	CONSTRAINT "booking_complete" CHECK(("slots"."booked_at" is null and "slots"."guest_name" is null and "slots"."guest_email" is null) or ("slots"."booked_at" is not null and "slots"."guest_name" is not null and "slots"."guest_email" is not null))
);
--> statement-breakpoint
CREATE INDEX `slots_start_idx` ON `slots` (`starts_at`);