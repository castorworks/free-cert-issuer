# Free SSL Certificate Issuer

免费 SSL 证书签发工具，基于 Let's Encrypt ACME 协议，支持阿里云 DNS 自动验证。

## 功能

- 支持单域名、多域名、通配符证书
- DNS-01 / HTTP-01 两种验证方式
- 阿里云 DNS API 自动添加/清理 TXT 记录，一键签发
- 证书打包 zip 下载
- 单 Docker 镜像部署

## 快速开始

```bash
# 本地开发
npm install
npm run dev

# Docker 部署
docker build -t free-cert-issuer .
docker run -p 3000:3000 free-cert-issuer
```

## 一键部署到服务器

```bash
DEPLOY_HOST=your-server-ip ./scripts/deploy.sh
```

## 使用说明

1. 输入域名
2. 选择 DNS-01 + 开启阿里云自动验证
3. 在页面输入阿里云 RAM 子账号的 AccessKey ID / Secret（仅用于本次请求，服务端不存储）
4. 点击签发，等待完成
5. 下载 zip（含 certificate.pem / private-key.pem / fullchain.pem）

> 也支持 HTTP-01 手动验证方式，无需阿里云账号。

## 阿里云 RAM 权限

子账号需要 `AliyunDNSFullAccess` 或以下最小权限：

- `alidns:AddDomainRecord`
- `alidns:DeleteDomainRecord`
- `alidns:DescribeDomainRecords`
