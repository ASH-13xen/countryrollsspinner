# Campaign Deployment Report: Spin & Win System
## Technical Architecture & Backend Features

### 1. Mathematical Prize Probability Engine
* **Calculated Rotation Algorithms:** The spinning wheel visually operates like a random game of chance, but the underlying mathematical engine calculates exact rotational degrees to physically force the wheel to land on pre-determined prizes.
* **Strict Prize Quota Enforcement:** Prize distribution is rigorously locked to match exact client quotas, ensuring zero budget overruns:
  * **13 Codes:** 1 Aloo Roll + Softy Free
  * **13 Codes:** Softy Free
  * **12 Codes:** Free Large Fries
  * **12 Codes:** 1 Free Aloo Roll

### 2. Advanced CRM & Google Sheets Integration
* **Secure Lead Capture:** Implemented a mandatory registration gate that securely captures the customer's Name and Phone Number prior to them interacting with the campaign.
* **Real-Time Data Sync:** Features a seamless background API integration that silently transmits captured user data directly to a centralized Google Sheet.
* **Comprehensive Tracking:** The CRM sync instantly records the customer's identity, the exact prize they won, their unique tracking code, and the calculated expiration timestamp for effortless client management and auditing.

### 3. Non-Repeating Unique Code Generation
* **Shuffled Sequence Distribution:** Operates on a highly advanced, pre-shuffled deck of 50 unique identification integers synchronized via a sequential API counter.
* **Guaranteed Unique Issuance:** Guarantees that exactly 50 unique codes (e.g., `C001` to `C050`) are generated and issued to exactly 50 unique customers without any duplication.
* **Sequence Obfuscation:** The system scrambles the distribution order so codes appear perfectly random to the end-users (e.g., `C027`, then `C014`). This entirely prevents predictable prize patterns and masks the total number of remaining prizes from the public.

### 4. Strict Anti-Fraud & Abuse Prevention
* **Persistent Lockout System:** Enforces a rigid 1-spin limit per device utilizing persistent browser LocalStorage tracking.
* **Refresh Protection:** Automatically detects returning users. If a user refreshes the page or attempts to bypass the lock, they are permanently blocked from spinning again.
* **Prize Code Recovery:** If a user accidentally reloads the page after winning, the system securely retrieves and displays their previously won prize code to ensure legitimate customers never lose their rewards.

### 5. Automated Coupon Expiration System
* **Dynamic Time-Stamping:** Automatically calculates an exact 48-hour expiration window starting from the exact second the customer wins.
* **Record Verification:** The expiration date is appended directly to the unique code within the Google Sheets database to allow cashiers and staff to easily verify if a presented coupon is still valid.

### 6. Interactive User Experience Enhancements
* **High-Performance Synchronization:** The wheel's animation timing (exactly 4.0 seconds) is executed concurrently with the background API requests, guaranteeing the winner popup displays the exact millisecond the wheel physically stops spinning.
* **1-Click Clipboard Copy:** Includes an integrated "Copy" button inside the prize modal for instant clipboard functionality, streamlining the redemption process for the customer.
* **Confetti Engine:** Triggers a high-performance particle confetti explosion upon winning to maximize customer satisfaction and psychological engagement.
