const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const {
  AuthenticationError,
  ForbiddenError
} = require('apollo-server-express');
require('dotenv').config();

const gravatar = require('../util/gravatar');

module.exports = {
  newNote: async (parent, args, { models, user }) => {
    // Если в контексте нет пользователя, выбрасываем AuthenticationError 
    if (!user) {
      throw new AuthenticationError('You must be signed in to create a note');
    }
    return await models.Note.create({
      content: args.content,
      // Ссылаемся на mongo id автора
      author: mongoose.Types.ObjectId(user.id)
    });
  },
  deleteNote: async (parent, { id }, { models, user }) => {
    if (!user) {
      throw new AuthenticationError('You must be signed in to create a note');
    }

    //Находим заметку
    const note = await models.Note.findById(id);
    //Если владелец заметки и текущий пользователь не совпадают, выбрасываем запрет на действие
    if (note && String(note.author) !== user.id) {
      throw new ForbiddenError("You don't have permissions to delete the note");
    }

    try {
      //Если все проверки проходят, удаляем заметку
      await note.remove();
      return true;
    } catch (err) {
      return false;
    }
  },
  updateNote: async (parent, { content, id }, { models, user }) => {
    if (!user) {
      throw new AuthenticationError('You must be signed in to create a note');
    }

    //Находим заметку
    const note = await models.Note.findById(id);
    //Если владелец заметки и текущий пользователь не совпадают, выбрасываем запрет на действие
    if (note && String(note.author) !== user.id) {
      throw new ForbiddenError("You don't have permissions to delete the note");
    }

    // Обновляем заметку в БД и возвращаем ее в обновленном виде
    return await models.Note.findOneAndUpdate(
      {
        _id: id
      },
      {
        $set: {
          content
        }
      },
      {
        new: true
      }
    );
  
  },
  signUp: async (parent, { username, email, password }, { models }) => {
    // normalize email address
    email = email.trim().toLowerCase();
    // hash the password
    const hashed = await bcrypt.hash(password, 10);
    // create the gravatar url
    const avatar = gravatar(email);
    try {
      const user = await models.User.create({
        username,
        email,
        avatar,
        password: hashed
      });

      // create and return the json web token
      return jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    } catch (err) {
      // if there's a problem creating the account, throw an error
      throw new Error('Error creating account');
    }
  },
  signIn: async (parent, { username, email, password }, { models }) => {
    if (email) {
      // normalize email address
      email = email.trim().toLowerCase();
    }

    const user = await models.User.findOne({
      $or: [{ email }, { username }]
    });

    // if no user is found, throw an authentication error
    if (!user) {
      throw new AuthenticationError('Error signing in');
    }

    // if the passwords don't match, throw an authentication error
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new AuthenticationError('Error signing in');
    }

    // create and return the json web token
    return jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  },
  toggleFavorite: async (parent, { id }, { models, user }) => {
    // Если контекст пользователя не передан, выбрасываем ошибку 
    if (!user) {
      throw new AuthenticationError();
    }

    // Проверяем, отмечал ли пользователь заметку как избранную
    let noteCheck = await models.Note.findById(id);
    const hasUser = noteCheck.favoritedBy.indexOf(user.id);

    // Если пользователь есть в списке, удаляем его оттуда и уменьшаем значение favoriteCount на 1
    if (hasUser >= 0) {
      return await models.Note.findByIdAndUpdate(
        id,
        {
          $pull: {
            favoritedBy: mongoose.Types.ObjectId(user.id)
          },
          $inc: {
            favoriteCount: -1
          }
        },
        {
          // Устанавливаем new как true, чтобы вернуть обновленный документ
          new: true
        }
      );
    } else {
      // Если пользователя в списке нет, добавляем его туда и увеличиваем значение favoriteCount на 1
      return await models.Note.findByIdAndUpdate(
        id,
        {
          $push: {
            favoritedBy: mongoose.Types.ObjectId(user.id)
          },
          $inc: {
            favoriteCount: 1
          }
        },
        {
          new: true
        }
      );
    }
  },
  
};
