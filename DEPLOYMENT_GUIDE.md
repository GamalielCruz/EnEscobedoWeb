# 🚀 Deployment Guide - Store with Click & Collect

## Quick Start Deployment

### **Option 1: Vercel (Recommended - 5 minutes)**

1. **Connect Repository**
   ```bash
   # Push your code to GitHub if not already done
   git add .
   git commit -m "Ready for production"
   git push origin main
   ```

2. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Next.js

3. **Set Environment Variables**
   In Vercel dashboard → Settings → Environment Variables:
   ```
   NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
   NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
   NEXT_PUBLIC_SANITY_PROJECT_ID=kgklfrat
   NEXT_PUBLIC_SANITY_DATASET=production
   SANITY_STUDIO_PROJECT_ID=kgklfrat
   SANITY_STUDIO_DATASET=production
   SANITY_API_TOKEN=your_token
   SANITY_API_READ_TOKEN=your_read_token
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_your_key
   CLERK_SECRET_KEY=sk_live_your_secret
   STRIPE_SECRET_KEY=sk_live_your_stripe_key
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_maps_key
   GOOGLE_MAPS_API_KEY=your_maps_key
   MAPS_API_KEY=your_maps_key
   ```

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your app will be live at `https://your-app.vercel.app`

### **Option 2: Netlify**

1. **Build Settings**
   - Build command: `npm run build`
   - Publish directory: `.next`

2. **Environment Variables**
   Add the same variables as Vercel in Netlify dashboard

### **Option 3: Railway**

1. **Connect Repository**
   - Go to [railway.app](https://railway.app)
   - Create new project from GitHub

2. **Configure**
   - Railway auto-detects Next.js
   - Add environment variables
   - Deploy automatically

## Production Services Setup

### **1. Stripe Production**

1. **Switch to Live Mode**
   - Go to Stripe Dashboard
   - Toggle to "Live" mode
   - Get live API keys

2. **Configure Webhooks**
   - Add webhook endpoint: `https://your-domain.com/webhook`
   - Select events:
     - `checkout.session.completed`
     - `checkout.session.expired`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`

3. **Test Payments**
   - Use real payment methods
   - Verify OXXO integration
   - Test bank transfers

### **2. Clerk Authentication**

1. **Production Instance**
   - Create production instance in Clerk
   - Configure allowed domains
   - Set redirect URLs

2. **Update Keys**
   - Replace test keys with live keys
   - Update webhook URLs

### **3. Sanity CMS**

1. **Production Dataset**
   - Ensure production dataset exists
   - Migrate data if needed:
   ```bash
   npx sanity dataset export development backup.tar.gz
   npx sanity dataset import backup.tar.gz production
   ```

2. **API Tokens**
   - Generate production tokens
   - Set proper permissions
   - Update CORS settings

### **4. Google Maps**

1. **Production API Key**
   - Create new API key for production
   - Restrict to your domain
   - Enable required APIs:
     - Maps JavaScript API
     - Places API
     - Geocoding API

## Post-Deployment Checklist

### **1. Immediate Testing**
- [ ] Site loads correctly
- [ ] Authentication works
- [ ] Payment processing functional
- [ ] Click & Collect flow complete
- [ ] Admin panel accessible
- [ ] Store selection working
- [ ] Order creation and management

### **2. Performance Verification**
- [ ] Page load times < 3 seconds
- [ ] Mobile responsiveness
- [ ] Core Web Vitals passing
- [ ] Images loading properly

### **3. Functionality Testing**
- [ ] Complete purchase flow
- [ ] Order status updates
- [ ] Email notifications
- [ ] Webhook processing
- [ ] Error handling

## Monitoring Setup

### **1. Error Tracking**
Add Sentry for production error monitoring:

```bash
npm install @sentry/nextjs
```

### **2. Analytics**
Consider adding:
- Google Analytics
- Vercel Analytics
- Custom event tracking

### **3. Uptime Monitoring**
- UptimeRobot
- Pingdom
- StatusCake

## Maintenance

### **1. Regular Updates**
- Monitor dependency updates
- Security patches
- Performance optimizations

### **2. Backup Strategy**
- Regular Sanity backups
- Environment variable backups
- Code repository backups

### **3. Scaling Considerations**
- Monitor usage patterns
- Database performance
- API rate limits
- CDN optimization

## Support & Documentation

### **1. User Documentation**
- How to place orders
- Click & Collect process
- Payment methods
- Account management

### **2. Admin Documentation**
- Order management
- Status updates
- Store management
- System maintenance

## 🎉 You're Ready!

Your e-commerce store with Click & Collect is production-ready:

- ✅ **Complete order management system**
- ✅ **Multiple payment methods**
- ✅ **Click & Collect functionality**
- ✅ **Admin management panel**
- ✅ **Mobile-responsive design**
- ✅ **Optimized performance**
- ✅ **Secure authentication**
- ✅ **Real-time updates**

**Deploy with confidence! 🚀**