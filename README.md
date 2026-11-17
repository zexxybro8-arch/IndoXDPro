# IndoXDPro VPN Portal

IndoXDPro is a 100% frontend + database VPN portal and administrative management console powered by **React**, **Tailwind CSS**, and **Firebase (Cloud Firestore & Authentication)**.

## Architecture
- **Pure Frontend SPA**: Built with Vite and React. No backend server or custom API endpoints are required.
- **Database**: Connected directly to **Cloud Firestore** for real-time synchronization of countries, VPN servers, IP codes, redeem codes, and connection audit logs.
- **Admin Authentication**: Secure admin login using **Firebase Authentication (Email/Password)** mapped via secure Firestore rules.

---

## How to Publish to GitHub

1. **Initialize Git & Commit**:
   ```bash
   git init
   git add .
   git commit -m "Initial IndoXDPro commit"
   ```

2. **Create a GitHub Repository**:
   - Go to [GitHub](https://github.com/new) and create a new public or private repository named `indoxdpro-vpn`.

3. **Push to GitHub**:
   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/indoxdpro-vpn.git
   git push -u origin main
   ```

4. **Deploy / Host**:
   - **GitHub Pages**: You can build the production bundle (`npm run build`) and deploy the `dist/` folder using GitHub Actions or gh-pages.
   - **Vercel / Netlify**: Import your GitHub repository directly. Vercel and Netlify will automatically detect Vite, run `npm run build`, and deploy your pure frontend app instantly.
