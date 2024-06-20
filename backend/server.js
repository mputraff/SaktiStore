import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import midtransClient from "midtrans-client";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import cors from "cors";
import db from "./config/Database.js";
import router from "./routes/index.js";
import Users from "./models/UserModels.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Utilitas untuk mendapatkan __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();
const port = 5000;

try {
  await db.authenticate();
  console.log("Database connected");
} catch (error) {
  console.log(error);
}

app.use(cors({ credentials: true, origin: "http://localhost:3000" }));
app.use(cookieParser());
app.use(express.json());
app.use(bodyParser.json());
app.use(router);

// Payment
const snap = new midtransClient.Snap({
  // Set to true if you want Production Environment (accept real transaction).
  isProduction: false,
  serverKey: "SB-Mid-server-n9Pw5l8Z70R1peXD9KRLmWQh",
  clientKey: "SB-Mid-client-JQdwnPjhRY5sA5BO",
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "saktistore229@gmail.com", // Ganti dengan email Anda
    pass: "pvsmcnxtpbekegol", // Ganti dengan password email Anda
  },
});

app.post("/payment", async (req, res) => {
  const { customerName, customerEmail, customerPhone, total, items } = req.body;

  console.log("Received payment request with data:", req.body);

  const itemDetails = items.map(item => ({
    id: item.name.toLowerCase().replace(/\s/g, '-'),
    price: item.price,
    quantity: item.quantity,
    name: item.name,
  }));

  const parameter = {
    transaction_details: {
      order_id: "order-id-" + Math.round(new Date().getTime() / 1000),
      gross_amount: total,
    },
    item_details: itemDetails,
    credit_card: {
      secure: true,
    },
    customer_details: {
      first_name: customerName,
      email: customerEmail,
      phone: customerPhone,
    },
  };

  try {
    console.log("Request parameter to Midtrans:", parameter); // Debug logging
    const transaction = await snap.createTransaction(parameter);
    console.log("Midtrans response:", transaction); // Debug logging

    const attachments = items.map(item => {
      // Ubah cara nama file diambil untuk memastikan tidak ada tambahan hash/ID
      const imgName = path.basename(item.img.split('/').pop().split('.')[0] + '.png'); // Ambil nama file tanpa hash
      const imgPath = path.join(__dirname, "img", imgName);

      console.log("Checking file:", imgPath); // Log untuk memeriksa path file

      if (!fs.existsSync(imgPath)) {
        throw new Error(`File not found: ${imgPath}`);
      }

      return {
        filename: imgName,
        path: imgPath,
        cid: item.name.toLowerCase().replace(/\s/g, '-') + '@saktistore'
      };
    });

    // Kirim email ke Sakti Store
    const saktiStoreEmailOptions = {
      from: "saktistore229@gmail.com",
      to: "saktistore229@gmail.com",
      subject: "Pemberitahuan Pembelian Produk",
      text: `User dengan nama ${customerName} telah membeli produk:\n\n${itemDetails.map(item => `- ${item.name} (Qty: ${item.quantity})`).join('\n')}\nTotal Harga: Rp${total}`,
      attachments
    };

    // Kirim email ke Pembeli
    const customerEmailOptions = {
      from: "saktistore229@gmail.com",
      to: customerEmail,
      subject: "Pembelian Produk Berhasil",
      text: `Anda telah membeli produk:\n\n${itemDetails.map(item => `- ${item.name} (Qty: ${item.quantity})`).join('\n')}\nTotal Harga: Rp${total}\n\nTerima kasih telah berbelanja di Sakti Store.`,
      attachments
    };

    await transporter.sendMail(saktiStoreEmailOptions);
    await transporter.sendMail(customerEmailOptions);

    res.status(200).json(transaction);
  } catch (error) {
    console.error("Midtrans Transaction Error:", error);
    res.status(500).json({ error: "Payment processing error" });
  }
});

app.post("/send-email", (req, res) => {
  const { customerName, customerEmail, subject, message } = req.body;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: customerEmail,
    to: "saktistore229@gmail.com",
    subject: subject,
    text: `Nama: ${customerName}\nEmail: ${customerEmail}\n\nPesan:\n${message}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Kesalahan saat mengirim email:", error);
      res
        .status(500)
        .send({ success: false, message: "Gagal mengirim email." });
    } else {
      console.log("Email terkirim:", info.response);
      res
        .status(200)
        .send({ success: true, message: "Email berhasil dikirim!" });
    }
  });
});

// Endpoint reset password
app.post("/request-password-reset", async (req, res) => {
  const { email } = req.body;
  console.log(`Received password reset request for email: ${email}`); // Log tambahan
  try {
    const user = await Users.findOne({ where: { email } });
    if (!user) return res.status(404).json({ msg: "Email tidak ditemukan" });

    const token = crypto.randomBytes(32).toString("hex");
    const expireDate = new Date(Date.now() + 3600000); // 1 jam

    user.reset_token = token;
    user.reset_token_expire = expireDate;
    await user.save();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "saktistore229@gmail.com",
        pass: "pvsmcnxtpbekegol"
      },
    });

    const mailOptions = {
      from: "saktistore229@gmail.com",
      to: email,
      subject: "Reset Password",
      text: `Klik link berikut untuk mereset password Anda: http://localhost:3000/reset-password/${token}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Failed to send email:", error); // Log tambahan
        return res.status(500).json({ msg: "Gagal mengirim email" });
      } else {
        console.log("Email sent:", info.response); // Log tambahan
        return res.status(200).json({ msg: "Email terkirim" });
      }
    });
  } catch (error) {
    console.error("Error in password reset request:", error); // Log tambahan
    return res.status(500).json({ msg: "Terjadi kesalahan" });
  }
});

// Endpoint untuk mengatur ulang password
app.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  console.log("Received reset password request"); // Log tambahan
  console.log("Token:", token); // Log tambahan
  console.log("Password:", password); // Log tambahan

  try {
    const user = await Users.findOne({
      where: {
        reset_token: token,
        reset_token_expire: { [Op.gt]: Date.now() },
      },
    });

    if (!user) {
      console.log("Invalid or expired token"); // Log tambahan
      return res.status(400).json({ msg: "Token tidak valid atau telah kedaluwarsa" });
    }

    const salt = await bcrypt.genSalt();
    const hashPassword = await bcrypt.hash(password, salt);
    user.password = hashPassword;
    user.reset_token = null;
    user.reset_token_expire = null;
    await user.save();

    console.log("Password has been reset successfully"); // Log tambahan
    return res.status(200).json({ msg: "Password berhasil direset" });
  } catch (error) {
    console.error("Error during password reset:", error); // Log tambahan
    return res.status(500).json({ msg: "Terjadi kesalahan" });
  }
});

app.listen(port, () => {
  console.log(`Server berjalan pada port ${port}`);
});
