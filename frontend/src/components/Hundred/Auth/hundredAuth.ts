import { Amplify } from 'aws-amplify'
import 'aws-amplify/auth/enable-oauth-listener'

/**
 * Hundred本番環境で利用するAmazon Cognitoの公開設定。
 *
 * User Pool ID、App Client ID、Cognitoドメインはブラウザから参照される
 * 公開識別子であり、クライアントシークレットやAWS認証情報ではない。
 */
const hundredCognitoConfig = {
  userPoolId: 'ap-northeast-1_CqkNv5buN',
  userPoolClientId: '6lp8qk50nnuf5n4a8u71dl9idi',
  domain:
    'ap-northeast-1cqknv5bun.auth.ap-northeast-1.amazoncognito.com',
} as const

/** 現在の実行環境に対応する、Cognitoからの戻り先Originを返す。 */
function getHundredAuthOrigin() {
  if (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  ) {
    return 'http://localhost:5173'
  }

  return 'https://yamahit.com'
}

/** 既存のCognito User PoolをAmplify Authへ接続する。 */
export function configureHundredAuth() {
  const authOrigin = getHundredAuthOrigin()

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: hundredCognitoConfig.userPoolId,
        userPoolClientId: hundredCognitoConfig.userPoolClientId,
        loginWith: {
          oauth: {
            domain: hundredCognitoConfig.domain,
            scopes: ['openid', 'email', 'profile'],
            redirectSignIn: [`${authOrigin}/auth/callback`],
            redirectSignOut: [`${authOrigin}/`],
            responseType: 'code',
            providers: ['Google'],
          },
        },
      },
    },
  })
}

