# RavenPOS Web App User Guide

This guide covers the most common RavenPOS workflows from actual app behavior.

## 1. Before You Start

- There is no public self-signup flow for admin or vendor users.
- An existing admin must create your account first.
- Employee access is PIN-based and also requires admin setup.

## 2. Role-Based Sign-In

### Admin sign-in

1. Go to `/login`.
2. Enter your admin email and password.
3. Click **Sign In**.
4. You will be redirected to `/admin`.

### Vendor sign-in

1. Ask an admin to create your vendor login first (see Admin section: "Set Up a Vendor Account").
2. Go to `/login`.
3. Enter your vendor email and password.
4. Click **Sign In**.
5. You will be redirected to `/vendor`.

### Employee sign-in (PIN)

1. Ask an admin to:
- Create your employee profile and PIN.
- Authorize the device you are using.
2. Go to `/employee/login`.
3. Enter your 4-digit PIN on the number pad.
4. After login, choose:
- **Clock In / Clock Out**
- **Go to POS**

## 3. Admin Workflows

### 3.1 Initial admin setup checklist

1. Sign in at `/login`.
2. Go to **Consignors** and create vendors (consignors).
3. Go to each consignor record and create vendor portal credentials.
4. Go to **Employees** to add employee PIN accounts.
5. In **Employees**, click **Authorize Device** on each employee terminal.
6. Optionally go to **Profile** to add additional admin users.

### 3.2 Add another admin user

1. Go to **Profile** (`/admin/profile`).
2. Find **Add Admin**.
3. Enter name (optional), email, and temporary password.
4. Click **Add Admin**.

### 3.3 Set up a vendor account

1. Go to **Consignors** (`/admin/consignors`).
2. Click **Add Consignor**.
3. Fill in business/contact/commission details.
4. Open the consignor detail page.
5. In **Vendor Portal Access**, either:
- Create new login: enter email + password, click **Create Vendor Login**.
- Reset existing login: enter password, click **Update Password**.
6. Share credentials securely with the vendor.

### 3.4 Add inventory as an admin

#### Option A: Add Items screen (best for targeted entry)

1. Go to **Inventory → Add Items** (`/admin/add-items`).
2. Select a consignor.
3. Choose mode:
- **Single Item** for one record.
- **Batch Entry** for many records.
4. Complete fields and save.
5. Use **View Inventory** in the success modal to verify.

#### Option B: CSV import

1. Go to **Inventory → Import CSV** (`/admin/import`).
2. Select consignor first.
3. Upload CSV (template available on page).
4. If Shopify-style CSV is detected, complete the Shopify preprocessing step.
5. Map columns (Name + Price required).
6. Click **Apply Mapping** and review preview.
7. Click **Import**.

### 3.5 Manage payouts

1. Go to **Finances → Payouts** (`/admin/payouts`).
2. Use **Pending Payouts** tab for amounts due.
3. Click **Details** on a consignor to review sales and deductions.
4. Click **Mark as Paid** (or **Pay** from row actions).
5. In **Confirm Payout** modal:
- Confirm full payout amount, or
- Enable **Pay a custom amount** for partial payouts.
6. If partial payout, choose remaining balance handling:
- **Deferred to future payout**, or
- **Forgiven / Removed**.
7. Add payout notes (optional) and click **Confirm Payout**.
8. Use **Payout History** tab for completed payouts.

### 3.6 Use POS (admin)

1. Go to **Point of Sale** (`/admin/pos`).
2. (Optional) Attach a customer:
- Search existing customer, or
- Create one with **+**.
3. Add cart items:
- Scan SKU/barcode in scanner field, or
- Click **+ Custom Item**.
4. Adjust quantities, remove items, and apply discounts (item or order).
5. (Optional) Apply gift card and/or store credit.
6. Choose payment method:
- **Cash**: enter cash tendered, click **Complete Cash Sale**.
- **Check**: optional check number, click **Complete Check Sale**.
- **Card**: connect reader, then click **Charge $X.XX**.
7. Deliver receipt via the receipt delivery modal.

#### Extra POS tools

- **Invoice** button: create invoice for selected customer or vendor.
- **Refund** button: open refund workflow.
- **Gift Card** button: sell a new gift card.
- **Monitor** button: open customer-facing display screen.

## 4. Vendor Workflows

### 4.1 First login and account basics

1. Sign in at `/login` with credentials created by an admin.
2. You will land on `/vendor` dashboard.
3. Use sidebar for Inventory, Sales, Payouts, Storefront, Messages, and Profile.

### 4.2 Add inventory as a vendor (different from admin)

Key differences from admin:
- You do not pick a consignor each time.
- Inventory is automatically tied to your own vendor account.

Steps:

1. Go to **My Inventory** (`/vendor/inventory`).
2. Choose tab:
- **Add Single Item**
- **Batch Entry**
3. Fill out item details and save.
4. Return to **View All Items** to edit or delete your items.

### 4.3 Vendor CSV import

1. Go to **Import CSV** (`/vendor/import`).
2. Upload CSV (template available).
3. Complete Shopify preprocessing step if prompted.
4. Map columns and preview items.
5. Click **Import**.

Note: import is automatically assigned to your vendor account.

### 4.4 View sales and payouts

1. Go to **My Sales** (`/vendor/sales`) to review sold items and earnings.
2. Use date filters as needed.
3. Go to **My Payouts** (`/vendor/payouts`) to view:
- Current balance
- Sales since last payout
- Payout history

### 4.5 Configure public storefront

1. Go to **Storefront** (`/vendor/storefront`).
2. Set storefront profile details:
- Name, slug, description
- Logo/header images
- Visibility settings
3. Save with **Save Storefront Settings**.
4. In **Item Visibility Controls**, toggle per-item settings:
- Show item
- Show in main browse
- Featured

### 4.6 Update vendor profile

1. Go to **Profile** (`/vendor/profile`).
2. Update contact information and save.
3. Change password in the **Change Password** section.

## 5. Employee Workflows

### 5.1 Employee account setup (admin-required)

Admin must do this first:

1. Go to **Employees** (`/admin/employees`).
2. Click **+ Add Employee**.
3. Set name and PIN (4-6 digits).
4. On employee device, click **Authorize Device** in admin Employees page.
5. Choose authorization duration and click **Authorize This Device**.

### 5.2 Employee daily sign-in and timeclock

1. Go to `/employee/login`.
2. Enter PIN.
3. On action screen:
- Click **Clock In** at start of shift.
- Click **Clock Out** at end of shift.
4. After clocking out, app returns to employee login.

### 5.3 Employee POS use

1. From action screen, click **Go to POS**.
2. Use POS similarly to admin POS for scan, cart, tender, and completion.

### 5.4 Employee schedule and time-off

1. Go to **Schedule & Time Off** (`/employee/schedule`).
2. Review shifts in week/month views.
3. Submit time-off requests in the requests tab.
4. Track status: pending, approved, or denied.

## 6. Quick Differences by Role

### Inventory ownership

- Admin: can add inventory for any consignor/vendor.
- Vendor: can add/edit only their own inventory.
- Employee: no dedicated inventory management flow.

### Payout authority

- Admin: calculates and records payouts, including partial payouts.
- Vendor: read-only view of earnings and payout history.

### Account creation

- Admin accounts: created by existing admin in **Profile**.
- Vendor accounts: created by admin in **Consignor Detail → Vendor Portal Access**.
- Employee accounts: created by admin in **Employees** with PIN.

## 7. Recommended First-Day Rollout Order (Admin)

1. Create/verify admin users.
2. Add consignors (vendors).
3. Create vendor portal logins.
4. Add employee PIN accounts.
5. Authorize employee devices.
6. Add/import inventory.
7. Run a test POS sale (cash + card if reader is configured).
8. Confirm payout calculations in **Payouts**.
