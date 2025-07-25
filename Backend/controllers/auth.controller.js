import { User } from '../models/user.model.js';
import { Otp } from '../models/otp.model.js';
import ApiResponse from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import sendEmail from '../utils/sendOTP.js';
import { OAuth2Client } from "google-auth-library";
import { getLinkedInAccessToken, verifyLinkedInToken } from '../utils/linkedinHandler.js';
import { getFacebookAccessToken, verifyFacebookToken } from '../utils/facebookHandler.js';
import { sendSMS } from '../utils/twilio.js';

let client = null;

// Create a function to get the client
const getOAuthClient = () => {
    if (!client) {
        if (!process.env.GOOGLE_CLIENT_ID) {
            throw new ApiError(500, "Google Client ID is not configured");
        }
        client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    }
    return client;
};

const generateAccessAndRefreshTokens = async (user) => {
    try {
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    }
    catch (error) {

        throw new ApiError(500, "Something went wrong while generating refresh and access token");
    }
}

const registerUser = asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;

    if ((email?.trim() === "" || !email) || (password?.trim() === "" || !password)) {
        throw new ApiError(400, "Email and Password are Required");
    }

    const userExist = await User.findOne({ email: email });

    if (userExist) {
        throw new ApiError(409, "User with this email already exists !");
    }

    const user = await User.create({
        email: email.toLowerCase(),
        password: password,
        name: name,
    });

    const otpCode = Math.floor(100000 + Math.random() * 900000);

    await Otp.create({
        userId: user._id,
        otp: otpCode,
    });

    sendEmail({
        from: process.env.SMTP_EMAIL,
        to: email,
        subject: "Verify OTP",
        text: `Hello ${email}, Your OTP for verification is ${otpCode}`,
    });

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken -role"
    );

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    res.status(201).
        json(
            new ApiResponse(200, {
                user: user,
            }, "User registered Succesfully"),
        );
});

const updateEmail = asyncHandler(async (req, res) => {
    const {email, otp, id} = req.body;
    if (email?.trim() === "" || !email) {
        throw new ApiError(400, "Email is Required");
    }

    const otpExist = await Otp.findOne({ userId: id });
    if (!otpExist) {
        throw new ApiError(400, "Invalid OTP");
    }
    if (otpExist.otp !== Number(otp)) {
        throw new ApiError(400, "Invalid OTP");
    }
    otpExist.verified = true;
    await otpExist.save();
    const user = await User.findByIdAndUpdate(id, { email: email }, { new: true }).select('email phoneNumber name verified role');
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    await Otp.deleteMany({ userId: id });
    await user.save();
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user);

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'None'
    };

    return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: user,
                    accessToken,
                },
                "User Verified Successfully",
            )
        );


})

const verifyOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if ((email?.trim() === "" || !email) || (otp?.trim() === "" || !otp)) {
        throw new ApiError(400, "Email and OTP are Required");
    }

    const user = await User.findOne({ email: email }).select('email phoneNumber name verified role');

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const otpExist = await Otp.findOne({ userId: user._id });

    if (!otpExist) {
        throw new ApiError(400, "Invalid OTP");
    }
    
    if (otpExist.otp !== Number(otp)) {
        throw new ApiError(400, "Invalid OTP");
    }
    
    otpExist.verified = true;

    await otpExist.save();
    
    user.verified = true;

    await user.save();

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user);

    user.refreshToken = refreshToken;

    await user.save();

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'None'
    };

    return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: user,
                    accessToken,
                },
                "User Verified Successfully",
            )
        );

});

 const sendOtp = asyncHandler(async (req,res)=> {
    const {email, id} = req.body;
    if (email?.trim() === "" || !email) {
        throw new ApiError(400, "Email is Required");
    }
    const otpCode = Math.floor(100000 + Math.random() * 900000);
    await Otp.create({
        userId: id,
        otp: otpCode,
    })

    sendEmail({
        from: process.env.SMTP_EMAIL,
        to: email,
        subject: "Verify OTP",
        text: `Hello ${email}, Your OTP for verification is ${otpCode}`,
    })

    res.status(200).json(
        new ApiResponse(200, {
            email: email,
        }, "OTP sent Succesfully"),
    );
})

const resendOtp = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email: email }).select('email');
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000);
    await Otp.deleteMany({ userId: user._id });

    await Otp.create({
        userId: user._id,
        otp: otpCode,
    });

    sendEmail({
        from: process.env.SMTP_EMAIL,
        to: email,
        subject: "Verify OTP",
        text: `Hello ${email}, Your OTP for verification is ${otpCode}`,
    });

    res.status(200).
        json(
            new ApiResponse(200, {
                email: email,
            }, "OTP sent Succesfully"),
        );
});

const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (email?.trim() === "" || !email || password?.trim() === "" || !password) {
        throw new ApiError(400, "Email and Password are Required");
    }

    const user = await User.findOne({ email: email }).select('email phoneNumber name verified role password');

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    if(user.password === null || user.password === undefined) {
        throw new ApiError(400, "User not registered with email and password");
    }

    if (!user.verified) {
        throw new ApiError(403, "User not verified");
    }

    const isMatch = await user.isPasswordCorrect(password);

    if (!isMatch) {
        throw new ApiError(400, "Invalid Password");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user);

    user.refreshToken = refreshToken;

    await user.save();

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'None'
    };

    return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: user,
                    accessToken,
                },
                "User logged in Successfully",
            )
        );
});

const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (email?.trim() === "" || !email) {
        throw new ApiError(400, "Email is Required");
    }

    const user = await User.findOne({ email: email }).select('email phoneNumber');

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000);

    await Otp.deleteMany({ userId: user._id });

    await Otp.create({
        userId: user._id,
        otp: otpCode,
    });

    sendEmail({
        from: process.env.SMTP_EMAIL,
        to: email,
        subject: "Reset Password",
        text: `Hello ${email}, Your OTP for verification is ${otpCode}`,
    });

    res.status(200).json(
        new ApiResponse(200, {
            email: email,
        }, "OTP sent Succesfully"),
    );
});

const updatePassword = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if ((email?.trim() === "" || !email) || (password?.trim() === "" || !password)) {
        throw new ApiError(400, "Email and Password are Required");
    }

    const user = await User.findOne({ email: email }).select('email');

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const otpExist = await Otp.findOne({ userId: user._id });

    if (!otpExist) {
        throw new ApiError(402, "User not Authorized");
    }

    if (!otpExist.verified) {
        throw new ApiError(403, "User not verified");
    }

    user.password = password;

    await user.save();

    await Otp.deleteMany({ userId: user._id });

    console.log(password, "Password Changed");

    res.status(200).json(
        new ApiResponse(200, {
            email: email,
        }, "Password Updated Successfully"),
    );
});

const signInWithGoogle = asyncHandler(async (req, res) => {
    const { token } = req.body;

    if (!token || typeof token !== "string") {
        throw new ApiError(400, "Invalid or Missing Token");
    }


    if (!client) {
        client = getOAuthClient();
    }

    const ticket = await client.verifyIdToken({
        idToken: token
    });

    const payload = ticket.getPayload();
    const { email, name } = payload;

    let user = await User.findOne({ email: email }).select('-password');

    if (!user) {
        //Signing Up
        const newUser = await User.create({
            email: email,
            name: name,
            verified: true,
        })
        await newUser.save();
        user = await User.findById(newUser._id).select('email phoneNumber name verified role');
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user);
    user.refreshToken = refreshToken;
    await user.save();

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'None'
    };

    return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: user,
                    accessToken,
                },
                "User logged in Successfully",
            )
        );
});

const signInWithFacebook = asyncHandler(async (req, res) => {
    const { code } = req.body;
    if (!code) {
        throw new ApiError(400, "Code is Required");
    }


    const facebookAccessToken = await getFacebookAccessToken(code);
    const userDetails = await verifyFacebookToken(facebookAccessToken);

    let user = await User.findOne({ email: userDetails.email });

    if (!user) {
        user = await User.create({
            email: userDetails.email,
            name: userDetails.name,
            verified: true,
        });

        await user.save();
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user);

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'None'
    };

    return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: user,
                    accessToken,
                },
                "User logged in Successfully",
            )
        );
});

const signInWithPhoneNumber = asyncHandler(async (req, res) => {
    const { name, phoneNumber } = req.body;

    if (!phoneNumber) {
        throw new ApiError(400, "Phone Number is Required");
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000);

    let user = await User.findOne({ phoneNumber: phoneNumber }).select('email phoneNumber name verified role');

    if (!user) {
        user = await User.create({
            phoneNumber: phoneNumber,
            name: name,
            verified: false,
        });
    }
    
    await Otp.create({
        userId: user._id,
        otp: otpCode,
    });

    const response = await sendSMS(phoneNumber, `Your OTP is ${otpCode}`);

    if(response.success === false) {
        throw new ApiError(500, `Error sending OTP: ${response.error}`);
    }

    res.status(200).json(
        new ApiResponse(200, {
            phoneNumber: phoneNumber,
        }, "OTP sent Succesfully"),
    );
});

const verifyPhoneNumber = asyncHandler(async (req, res) => {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
        throw new ApiError(400, "Phone Number and OTP are Required");
    }

    const user = await User.findOne({ phoneNumber: phoneNumber }).select('email phoneNumber name verified role');

    if (!user) {
        throw new ApiError(404, "User not found");
    } 

    const otpExist = await Otp.findOne({ userId: user._id });
    if (!otpExist || otpExist.otp !== Number(otp)) {
        throw new ApiError(400, "Invalid OTP");
    }
    
    if (otpExist.expiresAt && otpExist.expiresAt < new Date()) {
        await Otp.deleteOne({ userId: user._id });
        throw new ApiError(400, "OTP has expired");
    }
    
    await Otp.deleteOne({ userId: user._id });

    user.verified = true;
    
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user);
    user.refreshToken = refreshToken;
    await user.save();

    const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'None'
    };

    return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: user,
                    accessToken,
                },
                "User Verified Successfully",
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    req.user.refreshToken = null;
    await req.user.save();
    res.clearCookie("accessToken", { httpOnly: true, secure: true, sameSite: 'None' });
    res.clearCookie("refreshToken", { httpOnly: true, secure: true, sameSite: 'None' });

    return res.status(200).json(new ApiResponse(200, {}, "User logged out successfully"));
});

export {
    registerUser,
    verifyOtp,
    resendOtp,
    loginUser,
    forgotPassword,
    updatePassword,
    signInWithGoogle,
    signInWithFacebook,
    updateEmail,
    sendOtp,
    signInWithPhoneNumber,
    verifyPhoneNumber,  
    logoutUser, 
};