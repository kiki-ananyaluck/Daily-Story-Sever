require("dotenv").config();

const config = require("./config.json");
const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const upload = require("./multer");
const fs = require("fs");
const path = require("path")

const User = require("./models/user.model");
const DailyStory = require("./models/dailyStory.model");
const { authenticateToken } = require("./utilities");

const baseUrl = process.env.BASE_URL;
const uploadsPath = process.env.UPLOADS_PATH;
const assetsPath = process.env.ASSETS_PATH;

mongoose.connect(config.connectionString);


const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));


app.post("/create-account", async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    return res
      .status(400)
      .json({ error: true, message: "All fields are required" })
  }

  const isUser = await User.findOne({ email });
  if (isUser) {
    return res
      .status(400)
      .json({ error: true, message: "User already exists" })
  }

  const hashedPassword = await bcryptjs.hash(password, 10)

  const user = new User({
    fullName,
    email,
    password: hashedPassword,
  });

  await user.save();

  const accessToken = jwt.sign(
    { userId: user._id },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "72h"
    }
  );


  return res.status(201).json({
    error: false,
    user: { fullName: user.fullName, email: user.email },
    accessToken,
    message: "Registration Successful",
  });


})

app.get("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400).json({ message: "Email and Password are required" })
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res
      .status(400).json({ message: "User not found" });
  }

  const isPasswordValidate = await bcryptjs.compare(password, user.password);
  if (!isPasswordValidate) {
    return res
      .status(400).json({ message: "Invalid Credentials" })
  }

  const accessToken = jwt.sign(
    { userId: user._id },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "72h"
    }
  );

  return res.json({
    error: false,
    message: "Login Successful",
    user: { fullName: user.fullName, email: user.email },
    accessToken,
  });
})

app.get("/get-user", authenticateToken, async (req, res) => {
  const { userId } = req.user
  const isUser = await User.findOne({ _id: userId });

  if (!isUser) {
    return res
      .sendStatus(401)
  }

  return res.json({
    user: isUser,
    message: "",
  });
})

app.post("/add-daily-story", authenticateToken, async (req, res) => {
  const { title, story, visitedLocation, imageUrl, visitedDate } = req.body;
  const { userId } = req.user

  if (!title || !story || !visitedLocation || !imageUrl || !visitedDate) {
    return res.
      status(400).json({ error: true, message: "All field are required" })
  }

  //convert visitedDate from milliseconds to Date object
  const parsedVisitedDate = new Date(parseInt(visitedDate));

  try {
    const dailyStory = new DailyStory({
      title,
      story,
      visitedLocation,
      userId,
      imageUrl,
      visitedDate: parsedVisitedDate
    });

    await dailyStory.save()
    res.status(201).json({ story: dailyStory, message: "Added Successfully" });
  } catch (error) {
    res.status(400).json({ error: true, message: error.message });
  }
})

app.get("/get-all-stories", authenticateToken, async (req, res) => {
  const { userId } = req.user;

  try {
    const dailyStory = await DailyStory.find({ userId: userId });
    res.status(200).json({ story: dailyStory });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

app.post("/image-upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: true, message: "No image uploaded" })
    }

    const imageUrl = `${baseUrl}/${uploadsPath}/${req.file.filename}`;

    res.status(201).json({ imageUrl });
  } catch (error) {
    res.status(500).json({ error: true, message: error.message })
  }
})

app.delete("/delete-image", async (req, res) => {
  const { imageUrl } = req.query;

  if (!imageUrl) {
    return res
      .status(400)
      .json({ error: true, message: "imageUrl parameter is required" })
  }

  try {
    const filename = path.basename(imageUrl);
    const filePath = path.join(__dirname, 'uploads', filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.status(200).json({ message: "Image deleted successfully" });
    } else {
      res.status(200).json({ error: true, message: "Image not found" });
    }
  } catch (error) {
    res.status(500).json({ error: true, message: error.message })
  }

})

app.post("/edit-story/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, story, visitedLocation, imageUrl, visitedDate } = req.body;
  const { userId } = req.user;

  if (!title || !story || !visitedLocation || !imageUrl || !visitedDate) {
    return res.
      status(400).json({ error: true, message: "All field are required" })
  }

  const parsedVisitedDate = new Date(parseInt(visitedDate));

  try {
    const dailyStory = await DailyStory.findOne({ _id: id, userId: userId });

    if (!dailyStory) {
      return res.status(404).json({ error: true, message: "Daily story not found" });
    }
    const placeholderImgUrl = `${baseUrl}/${assetsPath}/placeholder.jpg`

    dailyStory.title = title;
    dailyStory.story = story;
    dailyStory.visitedLocation = visitedLocation;
    dailyStory.imageUrl = imageUrl || placeholderImgUrl;
    dailyStory.visitedDate = parsedVisitedDate;

    await dailyStory.save();
    res.status(200).json({ story: dailyStory, message: 'Update Successful' })
  } catch (error) {
    res.status(500).json({ error: true, message: error.message })
  }
});

app.delete("/delete-story/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { userId } = req.user;

  try {
    const dailyStory = await DailyStory.findOne({ _id: id, userId: userId });

    if (!dailyStory) {
      return res.status(404).json({ error: true, message: "Daily story not found" });
    }

    await dailyStory.deleteOne({ _id: id, userId: userId });

    const imageUrl = dailyStory.imageUrl;
    const filename = path.basename(imageUrl);

    const filePath = path.join(__dirname, 'uploads', filename);

    fs.unlink(filePath, (err) => {
      if (err) {
        console.error("failed to delete image file:", err)
      }
    })

    res.status(200).json({ message: "Travel story deleted successfully" })

  } catch (error) {
    res.status(500).json({ error: true, message: error.message })
  }
})

app.post("/update-is-favourite/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { userId } = req.user;
  const { isFavourite } = req.body;

  try {
    const dailyStory = await DailyStory.findOne({_id: id, userId: userId})
    
    if (!dailyStory) {
      return res.status(404).json({ error: true, message: "Daily story not found" });
    }
    
    dailyStory.isFavourite = isFavourite;
    await dailyStory.save();

    res.status(200).json({ story: dailyStory, message: 'Update Successful' })
  } catch (error) {
    res.status(500).json({ error: true, message: error.message })
  }
})

//Sever static file from the uploads and assets directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")))
app.use("/assets", express.static(path.join(__dirname, "assets")))

app.listen(8000);
module.exports = app;
