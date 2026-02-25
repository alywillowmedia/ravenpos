# Invoice Feature Implementation

## Overview
Added a complete invoice feature to RavenPOS that allows creating invoices for both customers and vendors directly from the POS tab, with email delivery capabilities and payment tracking.

## Database Changes
- **New Migration**: `supabase/migrations/044_invoices.sql`
  - `invoices` table: Stores invoice data with recipient (customer/vendor), status (paid/unpaid), and totals
  - `invoice_items` table: Stores line items for each invoice with custom/database item tracking
  - RLS policies enabled for secure access

## New Types
- `Invoice` and `InvoiceItem` interfaces in `src/types/index.ts`
- `InvoiceRecipientType` ('customer' | 'vendor')
- `InvoiceStatus` ('unpaid' | 'paid')
- Invoice email data types in `src/types/invoice.ts`

## Frontend Components

### New Files
1. **src/pages/Invoices.tsx** - Finance tab page
   - Display all invoices in a searchable table
   - View invoice details with items
   - Mark invoices as paid/unpaid
   - Email invoices to recipients

2. **src/components/invoice/InvoiceDeliveryModal.tsx**
   - Modal for sending invoices via email
   - Can add email if not on file
   - Same email system as receipts

3. **src/hooks/useInvoices.ts**
   - `createInvoice()` - Create new invoice from cart items
   - `fetchInvoices()` - Get all invoices
   - `fetchInvoiceItems()` - Get items for specific invoice
   - `updateInvoiceStatus()` - Mark as paid/unpaid

4. **src/lib/invoice.ts**
   - Helper functions to convert cart/invoice data to email format

### Updated Files
- **src/pages/POS.tsx**
  - Added "Invoice" button in header
  - Create invoice modal with recipient selection
  - Can select customer or vendor
  - Optional note field
  - Integrates with invoice delivery modal

- **src/App.tsx**
  - Added route: `/admin/finances/invoices`

- **src/components/layout/Sidebar.tsx**
  - Added "Invoices" link under Finances dropdown

- **src/lib/emailReceipt.ts**
  - Added `sendInvoiceEmail()` function

## Backend (Edge Functions)

### New Edge Function
**supabase/functions/send-invoice-email/index.ts**
- Sends invoices via Resend API
- Beautiful email template matching receipt style
- Payment instructions footer: "Please call us to pay with a card, or stop by in person to pay in person."
- Handles both customer and vendor invoices

## Key Features

### Creating Invoices
1. Click "Invoice" button in POS (only enabled when cart has items)
2. Select recipient type (Customer or Vendor)
3. If vendor, select from consignor list
4. If customer, must have customer selected in POS
5. Optional note field
6. Click "Create Invoice"

### Managing Invoices
Access via Finances > Invoices sidebar link:
- View all invoices in table format
- Search by recipient name, email, or status
- Click "View" to see invoice details with items
- Click "Mark Paid/Unpaid" to toggle payment status
- Click "Email Invoice" to send via email
- Can add email if not already on file

### Status Tracking
- Invoices have `unpaid` or `paid` status
- `paid_at` timestamp records when marked as paid
- Payment tracking for accounting purposes

## Technical Details

### Data Flow
1. User adds items to cart in POS
2. Click "Invoice" button → modal opens
3. Select recipient and add optional note
4. System creates invoice + line items in database
5. Modal closes, InvoiceDeliveryModal opens
6. User can email invoice immediately
7. Invoice available in Finances > Invoices tab

### Email System
- Uses same Resend API as receipts
- Email-safe HTML with inline styles
- Shows invoice #, recipient, items, totals
- Payment instructions footer
- Professional Ravenlia branding

### Database Relationships
- Invoices link to customers OR consignors (not both)
- Invoice items track both item_id (for inventory items) and custom item name
- Prices stored with line totals for accurate history

## Notes for Future Enhancement
- Currently payment is marked manually with a button click
- Could integrate with payment processor later
- Could add recurring/quote feature
- Could track invoice delivery status (sent/opened/etc)
- Could add invoice numbering system
- Could add payment reminders

## File Locations
```
/src/
  pages/
    Invoices.tsx
  components/
    invoice/
      InvoiceDeliveryModal.tsx
  hooks/
    useInvoices.ts
  lib/
    invoice.ts
  types/
    invoice.ts

/supabase/
  migrations/
    044_invoices.sql
  functions/
    send-invoice-email/
      index.ts
```
