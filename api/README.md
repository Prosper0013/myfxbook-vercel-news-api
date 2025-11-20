/* ==================================================================*/
/*  File: README.md*/
/*  ================================================================== */

/*
Quick notes to deploy on Vercel (no command-line required):

1. Create a GitHub repository and push these files (api/news.js and package.json and README)
   - For convenience you can create the repo and upload files via GitHub web UI.

2. Sign in to https://vercel.com and create a new project -> Import from GitHub -> select repository.

3. In Vercel Project Settings -> Environment Variables, add the following:
   - MYFX_EMAIL  = your_myfxbook_email
   - MYFX_PASSWORD = your_myfxbook_password
   - (optional) CACHE_SECONDS = 60

4. Deploy. After deployment your function will be available at:
   https://<your-vercel-app>.vercel.app/api/news

5. Test with browser or curl:
   curl https://<your-vercel-app>.vercel.app/api/news

Security notes:
- DO NOT commit your MyFXBook credentials into the repo. Use Vercel env vars only.
- Treat this endpoint as private; if you want to restrict access, add an API key check in the handler and set it as an env var.

*/
