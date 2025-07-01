# Deosoon Bot Project
### Discord Bot for Translation and Role Management using AWS Translate and AWS DynamoDB
![Deosoon AI Picture](./docs/Deosoon_AI.png)

> **"I’ll interpret for you all. And of course, it’s better if you’re more active, right?"**

---

## 🧠 Main Features

### 1. Real-time Translation Based on Chat
- Set input/output languages via Slash Commands
- Save user-specific translation settings to DynamoDB
- Perform real-time translation using AWS Translate API
- If no user settings exist, translation is skipped

### 2. Assign Roles Based on Activity
- Record user chat activity count and automatically assign roles when exceeding certain thresholds
- Revoke or downgrade roles if user activity remains low for a long period

### 3. GPT-based “Deosoon Persona” Feature (Planned)
- Provided only to specific supporters or users with the Flex role
- To be implemented using OpenAI ChatGPT API (planned)

---

## ⚙️ Tech Stack

| Component | Technology Used |
|-----------|-----------------|
| **Frontend (UI)** | Discord.js (Slash Command based) |
| **Backend** | Node.js, Discord.js |
| **API Integration** | Discord API, AWS Translate, OpenAI API (optional) |
| **Database** | AWS DynamoDB |
| **Server** | AWS EC2, AWS Lambda (for some REST functions) |
| **Deployment & Code Management** | GitHub |

---

## 🤖 How to Run

### Install Node.js Modules
- Developed with Node.js (22.0 or higher). Install modules by running the command below:

```cmd
npm install discord.js @aws-sdk/client-dynamodb @aws-sdk/client-translate
```

### Required Files and Configuration
- You need to create a separate `config.json` file with the following structure:

```json
{
  "token": "Discord bot token",
  "guildId": "Your Discord server ID",
  "clientId": "Discord bot client ID",
  "region": "Your AWS region",
  "accessKeyId": "AWS_ACCESS_KEY",
  "secretAccessKey": "AWS_SECRET_KEY"
}
```

### AWS Resources
- The DB uses DynamoDB, so you must set it up yourself.
- Modify the code in `index.js` as needed. (For security and easy config changes, variables are stored in config.)

---

## 📐 Architecture Overview

### 🔁 Initial Setup
- User configures translation settings via SlashCommand
  - User settings (input/output language, ON/OFF) saved to DB

### 🌐 Real-time Translation Flow
User sends a chat → Check translation settings in DynamoDB → If language settings exist, call AWS Translate → Send translated message to Discord

### 🎖️ Role Assignment Flow
User sends chats → Record chat count → Automatically assign roles when reaching threshold → Adjust roles downward if activity decreases (based on several months)

---

## 😃 Example Execution Results

### If the bot responds as below, the setup is complete.

* Example conversation using /chat command

![EN_EX1_chat](./docs/execution_1_en.png)

* When exceeding certain activity level

![EX2_ruleupdate](./docs/execution_2.png)

* Example result when translation is performed (actual result)

![EX3_translate](./docs/execution_3.png)

* Translation settings screen

![EX4_setting](./docs/execution_4.png)

---

## 📬 How to Contribute

If you’d like to collaborate on Deosoon’s development or have ideas,  
please DM Undery (Discord server: `https://discord.gg/ungdengri`).

---

## 📌 Miscellaneous

- The project is maintained as a public repository.
- The GPT Persona feature currently runs only on a personal server.
- Translation data is not stored and is processed only in real time.
