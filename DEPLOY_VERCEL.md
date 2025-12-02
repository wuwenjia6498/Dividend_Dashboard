# Vercel CLI 部署指南

## 安装 Vercel CLI

```bash
npm install -g vercel
```

## 登录 Vercel

```bash
vercel login
```

## 部署到 Vercel

在项目根目录运行：

```bash
cd frontend
vercel
```

按照提示操作：
- Set up and deploy? Y
- Which scope? (选择你的账号)
- Link to existing project? (如果已有项目选择Y，否则选N)
- What's your project's name? Dividend_Dashboard
- In which directory is your code located? ./

## 设置环境变量

```bash
vercel env add DATABASE_URL
vercel env add GITHUB_PAT
vercel env add GITHUB_OWNER
vercel env add GITHUB_REPO
```

## 生产部署

```bash
vercel --prod
```

完成！
