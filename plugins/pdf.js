const { Module } = require("../main");
const { convert: imageToPdf, sizes } = require("image-to-pdf");
const fileSystem = require("node:fs/promises");
const fileType = require("file-type");
const { MODE } = require("../config");
const path = require("path");
const fs = require("fs");
const { getTempSubdir, getTempPath } = require("../core/helpers");

const getFileType = async (buffer) => {
  try {
    if (fileType.fileTypeFromBuffer) {
      return await fileType.fileTypeFromBuffer(buffer);
    }

    if (fileType.fromBuffer) {
      return await fileType.fromBuffer(buffer);
    }

    return await fileType(buffer);
  } catch (error) {
    console.log("file-type detection failed:", error);
    return null;
  }
};

const imageInputDirectory = getTempSubdir("pdf");
const finalPdfOutputPath = getTempPath("converted.pdf");

Module(
  {
    pattern: "pdf ?(.*)",
    fromMe: MODE === "private",
    desc: "Tasveerein PDF mein",
    use: "converters",
    usage: ".pdf help",
  },
  async (message, commandArguments) => {
    const subCommand = commandArguments[1]?.toLowerCase();

    if (subCommand === "help") {
      await message.sendReply(
        `_1. Input images using .pdf_\n_2. Get output pdf using .pdf get_\n_3. Added images by mistake? then delete all inputted images using .pdf delete_\n_4. All files will be auto deleted after the output is produced_`
      );
    } else if (subCommand === "delete") {
      const currentFiles = await fileSystem.readdir(imageInputDirectory);
      const filesToDelete = currentFiles.map((fileName) =>
        path.join(imageInputDirectory, fileName)
      );

      await Promise.all(
        filesToDelete.map((filePath) => fileSystem.unlink(filePath))
      );

      try {
        await fileSystem.unlink(finalPdfOutputPath);
      } catch (error) {}
      await message.sendReply(`_Sab files saaf ho gayin!_`);
    } else if (subCommand === "get") {
      const allStoredFiles = await fileSystem.readdir(imageInputDirectory);
      const imageFilePaths = allStoredFiles
        .filter((fileName) => fileName.includes("topdf"))
        .map((fileName) => path.join(imageInputDirectory, fileName));

      if (!imageFilePaths.length) {
        return await message.sendReply("_Koi file nahi di gayi_");
      }

      const pdfGenerationStream = imageToPdf(imageFilePaths, sizes.A4);
      const pdfWriteStream = fs.createWriteStream(finalPdfOutputPath);

      pdfGenerationStream.pipe(pdfWriteStream);

      pdfWriteStream.on("finish", async () => {
        await message.client.sendMessage(
          message.jid,
          {
            document: { url: finalPdfOutputPath },
            mimetype: "application/pdf",
            fileName: "converted.pdf",
          },
          { quoted: message.data }
        );

        const filesToCleanUp = await fileSystem.readdir(imageInputDirectory);
        const tempFilesForDeletion = filesToCleanUp.map((fileName) =>
          path.join(imageInputDirectory, fileName)
        );
        await Promise.all(
          tempFilesForDeletion.map((filePath) => fileSystem.unlink(filePath))
        );
        await fileSystem.unlink(finalPdfOutputPath);
      });

      pdfWriteStream.on("error", async (error) => {
        await message.sendReply(`_PDF conversion failed: ${error.message}_`);
      });
    } else if (message.reply_message && message.reply_message.album) {
      // handle album
      const albumData = await message.reply_message.download();
      const allImages = albumData.images || [];

      if (allImages.length === 0)
        return await message.sendReply("_Album mein koi tasveer nahi (videos PDF mein nahi ban sakte)_");

      await message.send(
        `_Album ki tasveerein PDF mein add ho rahi hain..._`
      );

      for (let i = 0; i < allImages.length; i++) {
        try {
          const file = allImages[i];
          const detectedFileType = await getFileType(
            fs.readFileSync(file)
          );

          if (detectedFileType && detectedFileType.mime.startsWith("image")) {
            const newImagePath = path.join(
              imageInputDirectory,
              `topdf_album_${i}.jpg`
            );
            fs.copyFileSync(file, newImagePath);
          }
        } catch (err) {
          console.error("Failed to add album image to PDF:", err);
        }
      }

      await message.sendReply(
        `_*Album ki tasveerein save ho gayin*_\n_*Sab tasveerein tayyar. '.pdf get' se PDF banao!*_`
      );
    } else if (message.reply_message) {
      const repliedMessageBuffer = await message.reply_message.download(
        "buffer"
      );
      const detectedFileType = await getFileType(repliedMessageBuffer);

      if (detectedFileType && detectedFileType.mime.startsWith("image")) {
        const existingImageFiles = (
          await fileSystem.readdir(imageInputDirectory)
        ).filter((fileName) => fileName.includes("topdf"));
        const nextImageIndex = existingImageFiles.length;
        const newImagePath = path.join(
          imageInputDirectory,
          `topdf_${nextImageIndex}.jpg`
        );

        await fileSystem.writeFile(newImagePath, repliedMessageBuffer);
        return await message.sendReply(
          `*_Tasveer save ho gayi_*\n_*Kul save tasveerein: ${
            nextImageIndex + 1
          }*_\n*_Sab tasveerein save hone ke baad '.pdf get' se result lo. Conversion ke baad tasveerein delete ho jayengi!_*`
        );
      } else {
        return await message.sendReply(
          "_PDF ke liye tasveer pe reply karo!_"
        );
      }
    } else {
      return await message.sendReply(
        '_Tasveer pe reply karo, ya ".pdf help" se madad lo._'
      );
    }
  }
);
