# 目的
プルリクエストを取得して、チェックを行うためのツール  
以下のチェックを行う  

 - 変更前のコードクローンを検知します
   - コピペ先のコードの修正漏れがないか確認してください。
 - 変更後のメソッドの複雑度を算出します
   - 修正対象のメソッドの複雑度が予想外に大きくなっていないか確認してください。
 - 未定義の英単語を検知します
   - 未定義の英単語をチェックします。cSpell.jsonで単語を登録可能です。


## 実行例

```
node run --config 設定ファイル.config.json --output 出力先フォルダ  "user/repo_name" プルリクの番号
```

## 設定ファイル

```
{
  "user": "GitHubのユーザ名",
  "token": "GitHubのパーソナルアクセストークン",
  "root": "リポジトリ配下の解析フォルダ ex. srd または {src, ut}",
  "cSpell": "./cSpell.json などのcSpellの設定ファイル"
}
```

## 使用ツール

 - [cSpell](https://www.npmjs.com/package/cspell)
   - スペルチェックに使用します。
 - [jscpd](https://www.npmjs.com/package/jscpd)
   - コードクローンを検知します。
