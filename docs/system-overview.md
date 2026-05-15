# Bhavani Crafts - System Overview & Roadmap

## 🚀 Current Implementation Status

Bhavani Crafts is a high-fidelity e-commerce prototype for a craft supply store, featuring a complete end-to-end shopping experience and an administrative management interface.

### 1. Frontend & User Experience
*   **Modular Landing Page**: Features dynamic hero carousels, category discovery, "New Arrivals", "Featured Supplies", and automated trust signals (free shipping progress).
*   **Scalable Product Catalog**: Products use globally unique identifiers (**UUIDv4**) to ensure database readiness and prevent ID collisions.
*   **Interactive Shopping Cart**: Persistent Zustand-based cart with a slide-out drawer, quantity controls, and automated shipping calculations.
*   **High-Fidelity Checkout**: A 4-step guided flow covering Cart Review, Delivery Details, Payment Selection, and Order Confirmation.
*   **Responsive Design**: Fully optimized for mobile, tablet, and desktop using modern CSS techniques.

### 2. Authentication & Security
*   **Unified Login**: A custom branded login experience allowing users to sign in via **Google** or **Microsoft Authenticator** (Microsoft Entra ID).
*   **Route Protection**: Middleware-level security that restricts access to sensitive areas (like the Admin Panel) to authenticated users only.
*   **Modern Auth Handshake**: Built using Auth.js (v5) with OIDC standards.

### 3. Administrative Dashboard
*   **Business Insights**: Real-time stats dashboard showing mock revenue, orders, and customer trends.
*   **Order Management**: Full table view for tracking order status (Pending, Dispatched, Delivered).
*   **Product Control**: Inventory overview with stock status and category management.
*   **Live CMS Features**: Toggle-able Announcement Bars and Hero Carousel slides that update the site in real-time.

---

## 🛠️ Tech Stack

The project utilizes a cutting-edge, enterprise-grade stack focused on performance and developer experience:

| Category | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | **Next.js 16 (App Router)** | Using the latest React 19 features and Turbopack for fast builds. |
| **Authentication** | **Auth.js (v5)** | Secure session management with Google and Microsoft OIDC providers. |
| **Styling** | **Tailwind CSS 4** | Utilizing the latest engine for ultra-fast performance and clean UI. |
| **State Mgmt** | **Zustand** | Light, persistent client-side state for Cart and Wishlist. |
| **Animation** | **Framer Motion** | Smooth transitions for drawers, steps, and layout changes. |
| **UI Components** | **Radix UI / Shadcn** | Accessible, headless primitives for complex UI patterns. |
| **Icons** | **Lucide React** | Consistent, high-quality iconography. |
| **Type Safety** | **TypeScript** | Strict typing across the entire codebase for reliability. |

---

## 🔮 Future Considerations & Roadmap

### Phase 1: Data Persistence (Highest Priority)
*   **Database Integration**: Connect to **Supabase (PostgreSQL)** or **MongoDB** to replace static mock arrays.
*   **Server Actions**: Transition client-side mock logic to Next.js Server Actions for secure database mutations.
*   **File Storage**: Integrate **Cloudinary** or **AWS S3** for hosting actual product images.

### Phase 2: Transactional Maturity
*   **Payment Gateway**: Integrate **Razorpay** or **Stripe** to handle real currency transactions.
*   **Order Automation**: Connect the checkout flow to a real backend to generate invoice PDFs and email confirmations.
*   **WhatsApp API**: Integrate the **Twilio WhatsApp API** to send automated order updates to customers.

### Phase 3: Growth & Discovery
*   **Advanced Search**: Implement **Algolia** or Meilisearch for ultra-fast, typo-tolerant product search.
*   **SEO & Metadata**: Add dynamic OpenGraph tags and JSON-LD structured data for better Google ranking.
*   **Analytics**: Integrate **PostHog** or Google Analytics 4 to track user behavior and conversion funnels.

### Phase 4: Enterprise Features
*   **B2B Portal**: Create a separate portal for bulk/wholesale buyers with custom price lists.
*   **Inventory Alerts**: Automated "Low Stock" notifications for admin users.
*   **Customer Profiles**: Allow users to save multiple addresses and track lifetime purchase value.
