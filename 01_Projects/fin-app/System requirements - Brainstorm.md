---
tags:
  - Project
  - finance
  - projects/fin-app/project-doc
---
---
# Round 1 Questions

## 1. The Core Vision

### What is the main problems i want to solve?

- I want to to see all my accounts in one place.
- I want to track where my discretionary spending goes.
- I want to project my savings for specific goals
- I want to be able to have a diverse archetype of accounts available to view in the app (like stocks, managed funds, credit cards, bank accounts etc.)

### How would I describe the overall vibe or philosophy of the app? 

- I want the vibe to be functionally super fluid, and someone minimalist, similar to the Nothing OS. I really like the colours and philosophy they exhibit. 
- The app should be able to paint a full-picture of their past and present financial status holistically. It should also have some form of future-focused philosophy (maybe with the help of AI) and projections with strategy to reach goals for the future, based on the past and current financial behaviour of the user based on their data. 

---
## 2. Features and Functionality (The "What")

### How do you want the financial data to get into the app?

- The app should be a mix of automated and manual. 
- All the data, charts and calculations can be automated where they can (for example neobanks API keys), however I understand that Australian banking is limited in terms of data ingestion. 
- Therefore, there would still be some manual process for ingestion systems if needed. This would be .csv statements.

### What are the absolute "must-have" features for Version 1 (MVP)?

- Income tracking
- Expense categorisation/tagging
- Visual charts and dashboards
- Net worth tracking
- Recurring expense tracking
- Goal/budget setting

---
## 3. User Experience & Design (The "How it feels")

## When you open the app, what is the very first piece of information you want to see on your dashboard?

- Assuming the user has logged in already, they should see things like their net worth over time, their expense and spending by category information. I could be wrong with these, but generally the information that they should gather from opening the app is how is my financial health/trajectory looking? What is my current spending like? It should give them an overall picture. It should i guess also give information on what accounts are linked, and then maybe a snapshot of their 10 or so transactions. 
- Some other UI/UX considerations is that i don't want the app to feel like 'AI-slop' and look like other vibe-coded apps. I'd like to have cool features like structural motion on the site if possible.
- A cool idea would be for instead of the app to have standard tabs which the user clicks at the top nav, it would have a scrolling website (the entire app would feel like one webpage, with instant navigation and navigation animations). 

### Are there any existing finance apps, websites, or spreadsheets you’ve used that you liked or disliked? What stood out about them?

- Currently I have not seen any I have liked a lot so far. However, I have seen design and ui from other types of webapps that I like. As mentioned previously I like the Nothing UI. Its not perfect but i'd like to see what it looks like if an expert designed helped elevate it. 

--- 
## 4. Tech & Scope (The "Under the hood")

## Since you'll be building this with AI assistance, what is your preferred tech stack if you have one?

- I don't really have a preference, but with the design aspirations i guess React and Node.js?
- I have recently found out about google stitch and am willing to make use of this new product.
- I have Antigravity with Gemini pro and flash, and claude pro as well to help me build the product.
- At this stage im not sure how to implement google stitch with the current stack.
- There are also a few rules i want to implement. I want the app to be efficient, and therefore.
- As for modern practices, i previously built the alpha version using next.js with React, my database was prism orm, authentication was nextauth.js (JWT strategy), styling was tailwind css, charts were recharts, and ai-integration was gemini api. 
- I am open to use more improved or better tooling upon recommendation. 

### Is this strictly a desktop web app, or is optimized mobile viewing a priority for quick logging?

- At the moment i think its desktop web app. I'm not sure at this stage how to implement mobile viewing, and how helpful it would be, but im sure it can be done.

---
# Round 2 Questions

## 1. The UX & Animation Flow (The "Nothing OS" Vibe)

### **The Infinite Scroll Concept:** You mentioned wanting the entire app to feel like one continuous webpage with structural motion and instant navigation animations (likely using a tool like _Framer Motion_).  
• _Question:_ When a user clicks a menu item (e.g., "Projections" or "Transactions"), does the page smoothly auto-scroll down to that section, or do the sections dynamically slide/fade into view while staying on the same page?

- Yes I would like the page to smoothly auto-scroll down to that section.

### **The "Health Snapshot":** For the immediate dashboard view, you want a holistic picture of financial trajectory. If you had to pick the **one main hero metric** at the absolute top of the page, would it be **Net Worth** (past/present) or **Remaining Discretionary Budget** (the day-to-day focus)?

- If i had to pick one main hero metric it would be total net worth. If it was a card it would be a value, if it was a graph it would be the time-series of net worth.

---
## 2. **Data Ingestion & "Diverse Archetypes"**  

### **The Manual/CSV Process:** Since Australian open banking can be restrictive, CSV uploads are a smart MVP choice.  

 _Question:_ When a user uploads a CSV (e.g., CommBank or ANZ), do you want them to manually map the columns once, or should we design an **AI-parsing layer** where Gemini reads the CSV format automatically and cleans the data for Prisma?  

- I guess we could have both. A general parser which the user selects, maps their columns and saves it as an ingestion profile (e.g. user maps their AMEX export and it saves it as an AMEX profile after they ingest, and they can select that parser when ingesting new csv's). This could be a fallback if the AI parser doesn't work. I guess you can suggest which is better when we make the requirements doc. Probably the general parser route to save on api credits. 
### **Account Archetypes:** You want to track everything from neobanks to stocks and managed funds.  

_Question:_ For V1, will investment balances (like stocks) be manually updated by you (e.g., "I own $5,000 of ETF X"), or do you want to build a simple manual asset tracker where you input the number of shares and it calculates the total?

- I'd want to use .csv uploads to track stocks and managed funds via their exports of transactions. At the same time, to keep the stats current, we should use some form of mechanism to get live ticker data or pricing data to have the correct up-to-date stats and metrics. This is what would make the app useful for someone trying to consolidate their information. The goal is not have to do things manually. I am again open to suggestions after the interview.

--- 
## **3. Tech Stack & Google Stitch Integration**  

### **Google Stitch:** This is a powerful choice for modern apps, especially when you want to handle secure data workflows, serverless microservices, and tightly integrated AI components without managing massive, clunky backend infrastructure.  

_Question:_ In your alpha, Next.js handled both the frontend and the backend (via API routes). Would you be open to a architecture where **Next.js handles the fluid React frontend**, while **Google Stitch orchestrates your secure banking data ingestion, CSV processing pipelines, and Gemini AI workflows**?  

### **State Management & Charts:** Recharts is great, but for highly responsive, "structural motion" dashboards, sometimes libraries like _Tremor_ (built on Tailwind) or _nivo_ offer cleaner minimalism out of the box. 

_Question:_  Do you want to stick strictly to Recharts, or explore a library that naturally fits the Nothing OS aesthetic?

- I am open to suggestions. Charts should still be aesthetic and fluid. Recharts gave that option before in previous iterations, because it matched the standard ai design, but i have not enough experience in UI/UX to explore other libraries. 

--- 
## **4. The AI Philosophy (Avoiding "Slop")**  

### **Context-Driven AI:** To avoid looking like a generic "vibe-coded" app with a random chatbot shoved in the corner, the AI needs to be deeply integrated.  

_Question:_ Instead of a chat box, would you prefer the AI to operate as an **automated "insights engine"**? (e.g., a dedicated minimalist section on the dashboard that displays 2-3 bullet points generated by Gemini, like: _"Based on your current trajectory, you are on track to hit your property deposit goal 2 months early. Consider adjusting your discretionary cap this fortnight."_)

- Yes I dont want to have a chatbot in this iteration yet. It implies setting up multiple guardrails and isn't super helpful as im imagining it yet. I would rather AI be used as an insight generator based on the data, as well as making a function to 'AI categorize' transactions etc. 