const { admin, db }= require('../util/admin')
const firebase = require('firebase')
const config = require('../util/config')
firebase.initializeApp(config)
const { validateSignupData,validateLoginData, reduceUserDetails } = require('../util/validators')

exports.signUp = (req,res)=>{
    const newUser = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle,
    };
    const { valid, errors } = validateSignupData(newUser)
    if(!valid) return res.status(400).json(errors);

    const noImg = 'default.jpg'

    let token,userId;

    db.doc(`/users/${newUser.handle}`).get()
    .then(doc => {
        if(doc.exists){
            res.status(400).json({ handle: 'this handle is already taken' })
        }
        else{
        return firebase.auth().createUserWithEmailAndPassword(newUser.email, newUser.password )
        }
    })
    .then(data => {
        userId = data.user.uid;
        return data.user.getIdToken();
    })
    .then(idToken=>{
        token = idToken;
        const userCredentials = {
            handle: newUser.handle,
            email: newUser.email,
            createdAt: new Date().toISOString(),
            imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
            userId
        };
        db.doc(`/users/${newUser.handle}`).set(userCredentials)
    })
    .then(()=>{
        return res.status(201).json({ token });
    })
    .catch(err=>{
        console.error(err);
        if(err.code === 'auth/email-already-in-use'){
            return res.status(400).json({email: 'Email is already used'})
        }else{
           return res.status(500).json({general: 'Something went wrong, try again'});
        }
    });
}

exports.login = (req,res)=>{
    const user = {
        email: req.body.email,
        password: req.body.password
    };
    const { valid, errors } = validateLoginData(user)
    if(!valid) return res.status(400).json(errors);
    firebase.auth().signInWithEmailAndPassword(user.email, user.password)
    .then(data =>{
        return data.user.getIdToken();
    })
    .then(token=>{
        return res.json({token});
    })
    .catch(err => {
        console.error(err);
        return res.status(403).json({general: 'Wrong user or pass'});
    })
   };


   exports.addUserDetails = (req,res) => {
       let userDetails = reduceUserDetails(req.body);
       db.doc(`/users/${req.user.handle}`).update(userDetails)
       .then(()=>{
           return res.json({ message: 'Details added'})
       })
       .catch(err=>{
           console.error(err);
           return res.status(500).json({error:err.code})
       });
   };

   exports.getUserDetails = (req,res) => {
       let userData = {};
       db.doc(`/users/${req.params.handle}`).get()
       .then(doc=>{
           if(doc.exists){
               userData.user = doc.data();
               return db.collection('posts').where('handleUser', '==', req.params.handle)
               .orderBy('createdAt', 'desc')
               .get();
           }else {
               return res.status(404).json({error: 'User not found'})
           }
       })
       .then(data =>{
           userData.posts = [];
           data.forEach(doc => {
               userData.posts.push({
                   body: doc.data().body,
                   createdAt: doc.data().createdAt,
                   handleUser: doc.data().handleUser,
                   userImage: doc.data().userImage,
                   likeCount: doc.data().likeCount,
                   commentCount: doc.data().commentCount,
                   postId: doc.id

               })
           });
           return res.json(userData);
       })
       .catch(err => {
           console.error(err);
           return res.status(500).json({error: err.code})
       })
   }

   exports.getAuthenticatedUser = (req,res) =>{
       let userData = {};
       db.doc(`/users/${req.user.handle}`).get()
       .then(doc=>{
          if(doc.exists){
              userData.credentials = doc.data();
              return db.collection('likes').where('handleUser', '==', req.user.handle).get();
          } 
       })
       .then(data=>{
           userData.likes = []
           data.forEach(e =>{
              userData.likes.push(e.data());
           });
           return db.collection('notifications').where('recipient', '==', req.user.handle)
           .orderBy('createdAt', 'desc').get()
       })
       .then(data => {
           userData.notifications = []
           data.forEach(doc => {
               userData.notifications.push({
                   recipient: doc.data().recipient,
                   sender: doc.data().sender,
                   createdAt: doc.data().createdAt,
                   postId: doc.data().postId,
                   type: doc.data().type,
                   read: doc.data().read,
                   notificationId: doc.id
               })
           })
           return res.json(userData)
       })
       .catch(err =>{
           console.error(err);
           return res.status(500).json({ error: err.code })
       })
   }


   exports.uploadImage = (req,res) => {
       const busBoy = require('busboy');
       const path = require('path');
       const os = require('os');
       const fs = require('fs');
       const busboy = new new busBoy({headers: req.headers});
       let imageFileName;
       let imageTBUploaded = {};

       busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
           if(mimetype !== 'image/jpeg' && mimetype !== 'image/png' ){
               return res.status(400).json({error: 'Wrong filetype'})
           }
           const imageExtension = filename.split('.')[filename.split('.').length -1];
           const imageFileName =`${Math.round(Math.random() * 100000000)}.${imageExtension}`;
           const filepath = path.join(os.tmpdir(), imageFileName);
           imageTBUploaded = {filepath, mimetype};
           file.pipe(fs.createWriteStream(filepath));
       });
       busboy.on('finnish',()=>{
           admin.storage().bucket().upload(imageTBUploaded.filepath,
            {
                resumable: false,
                metadata: {
                    metadata:
                    {
                    contentType: imageTBUploaded.mimetype
                    }
                }
            })
            .then(()=>{
                const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`
                return db.doc(`/users/${req.user.handle}`).update({imageUrl: imageUrl});
            })
            .then(() => {
                return res.json({message: 'Image uploaded!'})
            })
            .catch(err =>{
                console.error(err);
                res.status(500).json({error: error.code})
            })
       })
       busboy.end(req.rawBody);
   }

   exports.markNotificationsRead = (req,res) => {
       let batch = db.batch();
       req.body.forEach((notificationId) => {
           const notification = db.doc(`/notifications/${notificationId}`);
           batch.update(notification, { read: true })
       });
       batch.commit()
         .then(() => {
             return res.json({message: 'Notifications marked read'})
         })
         .catch(err=>{
             console.error(err);
             return res.status(500).json({error: err.code})
         });
   };