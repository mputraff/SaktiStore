import Users from "../models/UserModels.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { Op } from "sequelize";


export const getUsers = async (req, res) => {
    try {
        const users = await Users.findAll({
            attributes: ['id', 'name', 'email']
        });
        res.json(users);
    } catch (error) {
        console.log(error);
    }
}

export const Register = async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;
    if (password !== confirmPassword) return res.status(400).json({ msg: "Password dan Confirm Password tidak cocok." });

    const salt = await bcrypt.genSalt();
    const hashPassword = await bcrypt.hash(password, salt);
    try {
        await Users.create({
            name: name,
            email: email,
            password: hashPassword
        });
        res.json({ msg: "Register Berhasil" });
    } catch (error) {
        console.log(error);
    }
}

export const Login = async (req, res) => {
    try {
        const user = await Users.findAll({
            where: {
                email: req.body.email
            }
        });
        const match = await bcrypt.compare(req.body.password, user[0].password);
        if (!match) return res.status(400).json({ msg: "Wrong Password" });
        const userId = user[0].id;
        const name = user[0].name;
        const email = user[0].email;
        const accessToken = jwt.sign({ userId, name, email }, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: '20s' 
        });
        const refreshToken = jwt.sign({ userId, name, email }, process.env.REFRESH_TOKEN_SECRET, {
            expiresIn: '1d' 
        });
        await Users.update({ refresh_token: refreshToken }, {
            where: {
                id: userId
            }
        });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000
        });
        res.json({ accessToken });
    } catch (error) {
        res.status(404).json({ msg: "Email Tidak Ditemukan" });        
    }

}

export const Logout = async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.sendStatus(204);
    const user = await Users.findAll({
        where: {
            refresh_token: refreshToken
        }
    });
    if (!user[0]) return res.sendStatus(204);
    const userId = user[0].id;
    await Users.update({ refresh_token: null }, {
        where: {
            id: userId
        }
    });
    res.clearCookie('refreshToken');
    return res.sendStatus(200);
}

export const requestPasswordReset = async (req, res) => {
    const { email } = req.body;
    try {
        console.log("Mencari user dengan email:", email);
        const user = await Users.findOne({ where: { email } });
        if (!user) {
            console.error("Email tidak ditemukan");
            return res.status(404).json({ msg: "Email tidak ditemukan" });
        }
  
        const token = crypto.randomBytes(32).toString("hex");
        const expireDate = new Date(Date.now() + 3600000); // 1 jam
  
        console.log("Menetapkan reset token dan tanggal kedaluwarsa");
        user.reset_token = token;
        user.reset_token_expire = expireDate;
        await user.save();
  
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL,
                pass: process.env.EMAIL_PASS,
            },
        });
  
        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: "Reset Password",
            text: `Klik link berikut untuk mereset password Anda: http://localhost:3000/reset-password/${token}`
        };
  
        console.log("Mengirim email reset password ke:", email);
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Gagal mengirim email:", error);
                return res.status(500).json({ msg: "Gagal mengirim email" });
            } else {
                console.log("Email terkirim:", info.response);
                return res.status(200).json({ msg: "Email terkirim" });
            }
        });
    } catch (error) {
        console.error("Error dalam requestPasswordReset:", error);
        return res.status(500).json({ msg: "Terjadi kesalahan" });
    }
  };

export const resetPassword = async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        const user = await Users.findOne({ where: { reset_token: token, reset_token_expire: { [Op.gt]: Date.now() } } });
        if (!user) return res.status(400).json({ msg: "Token tidak valid atau telah kedaluwarsa" });

        const salt = await bcrypt.genSalt();
        const hashPassword = await bcrypt.hash(password, salt);
        user.password = hashPassword;
        user.reset_token = null;
        user.reset_token_expire = null;
        await user.save();

        return res.status(200).json({ msg: "Password berhasil direset" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ msg: "Terjadi kesalahan" });
    }
};