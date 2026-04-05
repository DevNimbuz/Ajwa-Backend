# FlyAjwa Backend Developer Diary

This file serves as a persistent changelog and context marker for AI agents to understand the project's state.

## Core Infrastructure
* **Hosting**: Migrated from Render to Railway (Production).
* **Database**: MongoDB Atlas.
* **Asset Storage**: Migrated completely to Cloudinary to prevent Out-Of-Memory (OOM) crashes on ephemeral filesystems. All image uploads (Gallery, Testimonials) now strictly use `upload_stream` to Cloudinary.

## Security & Authentication
* **Authentication Method**: Transitioned from cross-domain cookies to **Bearer Tokens** (`Authorization: Bearer <token>`) to resolve production Safari/cross-origin login issues.
* **Audit Logging**: Comprehensive `AuditLog` model tracks sensitive admin actions.
* **Rate Limiting**: Configured global rate limiting to prevent brute-force attacks.

## API Architecture
* **Packages API**: Exposes dynamic variant pricing (days, flight inclusion, hotel stars).
* **Leads API**: Securely captures website enquires and tracks source/metadata.
* **Gallery/Testimonials**: Fully segregated customer review photos vs general gallery images.
