const { db } = require ('../util/admin')

exports.getAllPosts = (req,res)=>{
    db.collection('posts')
    .orderBy('createdAt', 'desc')
    .get()
    .then(data =>{
        let posts = [];
        data.forEach(doc =>{
         posts.push({
             postId: doc.id,
             body: doc.data().body,
             handleUser: doc.data().handleUser,
             createdAt: doc.data().createdAt,
             userImage: doc.data().userImage
         });
        });
        return res.json(posts)
    })
    .catch(err => console.error(err))
}

exports.postOnePost =  (req,res)=>{
    if(req.body.body.trim()===''){
        return res.status(400).json({body:'Body must not be empty'})
    }
    const newPost = {
        body: req.body.body,
        handleUser: req.user.handle,
        userImage: req.user.imageUrl,
        createdAt: new Date().toISOString(),
        likeCount: 0,
        commentCount: 0
    };
     db.collection('posts')
       .add(newPost)
       .then(doc =>{
           const resPost = newPost;
           resPost.postId = doc.id;
           res.json(resPost);
       })
       .catch(err => {
           res.status(500).json({error: 'something went wrong'});
           console.error(err);
       });
 }

 exports.getPost = (req,res) => {
     let postData = {};
     db.doc(`/posts/${req.params.postId}`).get()
     .then(doc => {
         if(!doc.exists){
             return res.status(404).json({ error: 'Post not found'})
         }
         postData = doc.data();
         postData.postId = doc.id;
         return db.collection('comments')
         .orderBy('createdAt', 'desc')
         .where('postId', '==', req.params.postId).get()
     })
     .then(data => {
         postData.comments = [];
         data.forEach(e =>{
             postData.comments.push(e.data())
         });
         return res.json(postData);
     })
     .catch(err => {
         console.error(err);
         res.status(500).json({error: err.code});
         })   
 }

 exports.commentOnPost = (req,res) => {
     if(req.body.body.trim() === '') return res.status(400).json({comment: 'Empty comment'})
     const newComment = {
         body: req.body.body,
         createdAt: new Date().toISOString(),
         postId: req.params.postId,
         handleUser: req.user.handle,
         userImage: req.user.imageUrl
     };
     db.doc(`/posts/${req.params.postId}`).get()
     .then(doc => {
         if(!doc.exists){
             return res.status(404).json({error: 'Post not found'});
         }
         return doc.ref.update({ commentCount: doc.data().commentCount + 1})
     })
     .then(()=>{
        return db.collection('comments').add(newComment)
     })
     .then(()=>{
         res.json(newComment);
     })
     .catch(err =>{
         console.log(err);
         res.status(500).json({ error: err.code })
     })
 }

 exports.likePost = (req,res) => {
     const likeDocument = db.collection('likes').where('handleUser', '==', req.user.handle)
     .where('postId', '==', req.params.postId).limit(1);
    const postDocument = db.doc(`/posts/${req.params.postId}`);
    let postData = {};
    postDocument.get()
    .then(doc=>{
        if(doc.exists){
            postData = doc.data();
            postData.postId = doc.id;
            return likeDocument.get();
        }
        else{
            return res.status(400).json({error: 'Post not found'})
        }
    })
    .then(data=>{
        if(data.empty){
            return db.collection('likes').add({
                postId: req.params.postId,
                handleUser: req.user.handle
            })
            .then(()=>{
                postData.likeCount++
                return postDocument.update({likeCount: postData.likeCount})
            })
            .then(()=>{
                return res.json(postData);
            })
        }
        else{
            return res.status(400).json({error: 'Post already liked'})
        }
    })
    .catch(err=>{
        res.status(500).json({error: err.code})
    })
 }

 exports.unlikePost = (req,res) => {
   const likeDocument = 
   db.collection('likes')
   .where('handleUser', '==', req.user.handle)
   .where('postId', '==', req.params.postId).limit(1);
   const postDocument = db.doc(`/posts/${req.params.postId}`);
   let postData = {};
   postDocument.get()
   .then(doc=>{
       if(doc.exists){
           postData = doc.data();
           postData.postId = doc.id;
           return likeDocument.get();
       }
       else{
           return res.status(400).json({error: 'Post not found'})
       }
   })
   .then(data=>{
       if(data.empty){
           return res.status(400).json({error: 'Post not liked'})
       }
       else{
        return db.doc(`/likes/${data.docs[0].id}`)
           .delete()
           .then(() => {
               postData.likeCount--;
               return postDocument.update({likeCount: postData.likeCount})
           })
           .then(() => {
               res.json(postData)
           })
       }
   })
   .catch(err=>{
       res.status(500).json({error: err.code})
   })
}

exports.deletePost = (req,res) => {
    const document = db.doc(`/posts/${req.params.postId}`);
    document.get()
    .then(doc => {
        if(!doc.exists){
            return res.status(404).json({error: 'Not found'})
        }
        if(doc.data().handleUser !== req.user.handle){
            return res.status(403).json({error: 'Unathorized request'})
        }
        else {
            return document.delete()
        }
    })
    .then(() =>{
        res.json({message: 'Post deleted'})
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({error: err.code})
    })
}