# RavenPOS Overview

RavenPOS is a modern, web-based Point of Sale (POS) and inventory management system designed for retail environments with a focus on vendor/consignor management. It features a comprehensive suite of tools for processing sales, tracking inventory, managing employees, and handling complex vendor payouts.

**Current Version:** v0.1.4

## Version History & Core Foundation (v0.1.0)
Before the tracked changelog began in v0.1.1, the following core systems were established in v0.1.0:
*   **Secure Authentication:** Robust role-based access control (RBAC) securely separating Admin and Vendor data.
*   **Barcode Label Generation:** Built-in tool to generate and print custom barcode labels for inventory items directly from the browser.
*   **Consignor Database:** Foundational vendor profile management system to track contact details and basic commission rates.
*   **Core Inventory CRUD:** The fundamental ability to Create, Read, Update, and Delete inventory items.
*   **Basic POS Loop:** The essential "Cart -> Checkout -> Transaction" flow structure.

## Tech Stack

*   **Frontend:** React, Vite, TypeScript, TailwindCSS
*   **Backend:** Supabase (Database, Auth, Edge Functions)
*   **Integrations:** Stripe (Payments), Shopify (Inventory Sync), Resend (Email Receipts)
*   **Key Libraries:** Recharts (Analytics), PapaParse (CSV Parsing), jsPDF (Receipt Generation), JsBarcode (Barcode Generation)

## Key Features

### 1. Point of Sale (POS)
*   **Streamlined Checkout:** Efficient interface for processing customer transactions.
*   **Refund System:**
    *   Support for full item refunds (Cash and Card).
    *   Automatic inventory restocking.
    *   Financial adjustments for vendor payouts, revenue, and taxes.
*   **Receipts:**
    *   Thermal printer-friendly PDF generation.
    *   Email receipts via Resend integration.
    *   Customizable receipt templates.
*   **Hardware Support:**
    *   Barcode scanner compatibility.
    *   Simulated Stripe Terminal integration for card payments.

### 2. Inventory Management
*   **Comprehensive Tracking:** Track stock levels, pricing, and variants.
*   **Item Management:**
    *   Add items individually or via batch entry.
    *   Image upload support with thumbnail previews.
    *   Label generation with barcodes.
*   **CSV Import:**
    *   Bulk import inventory from CSV.
    *   Support for importing image URLs.
    *   Mapping for external platforms (e.g., Shopify).

### 3. Vendor & Consignor System
*   **Vendor Portal:** A dedicated, restricted dashboard for vendors to view their own inventory and sales.
*   **Consignor Management:**
    *   Track commission splits.
    *   Manage monthly booth charges/rent.
*   **Payouts:**
    *   Automated calculation of amounts owed to consignors.
    *   Detailed payout tracking and history.
    *   Reconciliation tools for store vs. vendor revenue.

### 4. Employee Management
*   **Access Control:**
    *   PIN-based login and clock-in/out.
    *   Role-based permissions (Admin vs. Employee).
*   **Employee View:** restricted interface limiting access to sensitive admin functions while allowing POS usage.
*   **Time Tracking:** Monitor employee hours and shift history for payroll.

### 5. Integrations & Sync
*   **Shopify Integration:**
    *   **Import:** Pull products directly from existing Shopify stores.
    *   **Two-Way Sync:** Automatic synchronization of sales and inventory quantities between RavenPOS and Shopify.
    *   **Force Sync:** Manual override to resolve discrepancies.
*   **Stripe:** Integrated payment processing (currently simulated environment).

### 6. Public Storefront
*   **Browse Inventory:** Public-facing page for customers to browse store inventory by vendor or category.
*   **Search & Filter:** easy discovery of products.

### 7. Admin Dashboard & Analytics
*   **Live Analytics:** Real-time dashboard for sales performance.
*   **Sales History:** Detailed logs of past transactions.
*   **Customer Management:** Track customer purchase history and details.
*   **Financial Reporting:** Revenue breakdowns, tax calculations, and payout summaries.
