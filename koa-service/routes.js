const Router = require('koa-router')
const router = new Router()
const account = require('./actions/account')
const auth = require('./middlewares/auth')
const photo = require('./actions/photo')
const uuid = require('uuid')
const multer = require('koa-multer')
const path = require('path')

async function responseOK (ctx, next) {
  ctx.body = {
    status: 0
  }
  await next()
}
/**
 * 小程序登陆，接收小程序登陆获取的code
 */
router.get('/login', async (context, next) => {
  const code = context.query.code
  context.body = {
    status: 0,
    data: await account.login(code)
  }
})
/**
 * 修改用户信息
 */
router.put('/user', auth, async (context, next) => {
  await account.update(context.state.user.id, context.request.body)
  await next()
}, responseOK)

/**
 * 获取当前登陆的用户信息
 */
router.get('/my', auth, async (context, next) => {
  if (context.state.user.id) {
    context.body = {
      status: 0,
      data: context.state.user
    }
  } else {
    context.throw(401, '当前用户未登录')
  }
})

/**
 * 扫码登陆，获取二维码字符串
 */
router.get('/login/ercode', async (context, next) => {
  context.body = {
    status: 0,
    data: await account.getErCode()
  }
})

/**
 * 扫码登陆中，小程序侧调用的接口。将扫到的二维码信息传递过来
 */
router.get('/login/ercode/:code', auth, async (context, next) => {
  const code = context.params.code
  const sessionKey = context.get('x-session')
  await account.setSessionKeyForCode(code, sessionKey)
  await next()
}, responseOK)

/**
 * 轮询检查登陆状态
 */
router.get('/login/errcode/check/:code', async (context, next) => {
  const startTime = Date.now()
  async function login () {
    const code = context.params.code
    const sessionKey = await account.getSessionKeyByCode(code)
    if (sessionKey) {
      context.body = {
        status: 0,
        data: {
          sessionKey: sessionKey
        }
      }
    } else {
      if (Date.now() - startTime < 10000) {
        await new Promise((resolve) => {
          process.nextTick(() => {
            resolve()
          })
        })
        await login()
      } else {
        context.body = {
          status: -1
        }
      }
    }
  }
  await login()
})

/**
 * 获取相册列表
 */
router.get('/album', auth, async (context, next) => {
  const albums = await photo.getAlbums(context.state.user.id, context.query.pageIndex || 1, context.query.pageSize || 10)
  context.body = {
    data: albums,
    status: 0
  }
})
/**
 * 小程序种获取相册列表
 */
router.get('/xcx/album', auth, async (context, next) => {
  const albums = await photo.getAlbums(context.state.user.id)
  context.body = {
    data: albums,
    status: 0
  }
})
/**
 * 获取某个相册的相片列表
 */
router.get('/album/:id', auth, async (context, next) => {
  const photos = await photo.getPhotos(context.state.user.id, context.params.id, context.query.pageIndex || 1, context.query.pageSize || 10)
  context.body = {
    status: 0,
    data: photos
  }
})
/**
 * 小程序种获取相册的相片列表
 */
router.get('/xcx/album/:id', auth, async (context, next) => {
  const photos = await photo.getPhotos(context.state.user.id, context.params.id)
  context.body = {
    status: 0,
    data: photos
  }
})
/**
 * 添加相册
 */
router.post('/album', auth, async (context, next) => {
  const {
    name
  } = context.request.body
  await photo.addAlbum(context.state.user.id, name)
  await next()
}, responseOK)
/**
 * 修改相册
 */
router.put('/album/:id', auth, async (context, next) => {
  await photo.updateAlbum(context.params.id, context.body.name)
  await next()
}, responseOK)
/**
 * 删除相册
 */
router.del('/album/:id', auth, async (context, next) => {
  await photo.deleteAlbum(context.params.id)
  await next()
}, responseOK)

const storage = multer.diskStorage({
  destination: path.join(__dirname, 'uploads'),
  filename (req, file, cb) {
    const ext = path.extname(file.originalname)
    cb(null, uuid.v4() + ext)
  }
})

const uplader = multer({
  storage: storage
})
/**
 * 上传相片
 */
router.post('/photo', auth, uplader.single('file'), async (context, next) => {
  const {
    file
  } = context.req
  const {
    id
  } = context.req.body
  await photo.add(context.state.user.id, `https://static.ikcamp.cn/${file.filename}`, id)
  await next()
}, responseOK)
/**
 * 删除相片
 */
router.delete('/photo/:id', auth, async (context, next) => {
  const p = await photo.getPhotoById(context.params.id)
  if (p) {
    if (p.userId === context.state.user.id || context.state.user.isAdmin) {
      await photo.delete(context.params.id)
    } else {
      context.throw(403, '该用户无权限')
    }
  }
  await next()
}, responseOK)
/**
 * 按照状态获取相片列表，type类型如下：
 * pending：待审核列表
 * accepted：审核通过列表
 * reject：审核未通过列表
 */
router.get('/admin/photo/:type', auth, async (context, next) => {
  if (context.state.user.isAdmin) {
    const pageIndex = context.query.pageIndex || 1
    const pageSize = context.query.pageSize || 10
    const photos = await photo.getPhotosByApproveState(context.params.type, pageIndex, pageSize)
    context.body = {
      status: 0,
      data: photos
    }
  } else {
    context.throw(403, '该用户无权限')
  }
})

/**
 * 获取所有照片列表
 */
router.get('/admin/photo', auth, async (context, next) => {
  if (context.state.user.isAdmin) {
    const pageIndex = context.query.pageIndex || 1
    const pageSize = context.query.pageSize || 10
    context.body = {
      status: 0,
      data: await photo.getAll(pageIndex, pageSize)
    }
  } else {
    context.throw(403, '该用户无权限')
  }
})

/**
 * 审核照片,state为true/false
 */
router.put('/admin/photo/approve/:id/:state', auth, async (context, next) => {
  if (context.state.user.isAdmin) {
    await photo.approve(context.params.id, this.params.state)
  } else {
    context.throw(403, '该用户无权限')
  }
  await next()
}, responseOK)
/**
 * 获取用户列表
 */
router.get('/admin/user', async (context, next) => {
  context.body = {
    status: 0,
    data: await account.getUsers(context.query.pageIndex || 1, context.query.pageSize || 10)
  }
  await next()
})
/**
 * 修改用户类型，userType=1 为管理员， -1 未禁用用户
 */
router.get('/admin/user/:id/userType/:type', async (context, next) => {
  const body = {
    status: 0,
    data: await account.setUserType(context.params.id, context.params.type)
  }
  context.body = body
  await next()
})

module.exports = router
