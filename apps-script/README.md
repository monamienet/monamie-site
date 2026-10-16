# Backend do onboarding (Google Apps Script)

O [onboarding.html](../onboarding.html) envia as respostas para este script. Para cada envio, o script:

- cria uma subpasta no Drive com `logo-sem-texto.svg` e/ou `logo-com-texto.svg` (o parceiro envia ao menos um);
- registra uma linha na planilha, indicando qual arquivo vai para o ícone e qual vai para a tela de login;
- manda um e-mail de aviso com os arquivos anexados.

## Implantação (uma vez)

1. **Drive:** crie uma pasta *Onboarding de parceiros* e, dentro dela, uma subpasta *Envios*. Copie o ID da subpasta *Envios*, que é a parte da URL depois de `/folders/`. Cada envio vira uma subpasta dentro de *Envios*.
2. **Planilha:** dentro de *Onboarding de parceiros* (ao lado de *Envios*), crie uma planilha vazia e copie o ID dela, que é a parte da URL entre `/d/` e `/edit`. O cabeçalho é criado no primeiro envio.

   Na prática, a planilha pode ficar em qualquer lugar do seu Drive, porque o script a encontra pelo ID. Essa organização só serve para manter tudo junto sem misturar a planilha com as pastas dos envios:
   ```
   Onboarding de parceiros/
   ├── Respostas (planilha)        ← SHEET_ID
   └── Envios/                     ← FOLDER_ID
       ├── 2026-10-20 1432 – MonAmie AquariusTur/
       └── ...
   ```
3. **Script:** em [script.google.com](https://script.google.com), crie um **Novo projeto** e substitua o conteúdo de `Código.gs` pelo de [Code.gs](Code.gs).
4. **Propriedades:** em ⚙️ *Configurações do projeto* → *Propriedades do script*, adicione:
   | Propriedade | Valor |
   |---|---|
   | `FOLDER_ID` | ID da pasta (passo 1) |
   | `SHEET_ID` | ID da planilha (passo 2) |
   | `NOTIFY_EMAIL` | opcional; o padrão é `contact@monamienet.org` |
5. **Permissões:** no editor, selecione a função `checkSetup` e clique em **Executar**. Autorize o acesso ao Drive, às Planilhas e ao Gmail. O log deve mostrar os nomes da pasta e da planilha.
6. **Publicar:** *Implantar* → *Nova implantação* → tipo **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**

   Copie a URL que termina em `/exec`.
7. **Página:** no `onboarding.html`, troque o valor de `APPS_SCRIPT_URL` pela URL do passo 6.
8. **Google Sites:** crie a página → *Inserir* → *Incorporar* → *Incorporar código* → cole todo o HTML do `onboarding.html` e ajuste a altura do bloco.

Para conferir se a URL está no ar, abra-a no navegador. A resposta deve ser `{"ok":true,"service":"monamie-onboarding"}`.

## Atualizar o script

Depois de editar o código: *Implantar* → *Gerenciar implantações* → ✏️ → *Versão: Nova versão* → *Implantar*. A URL `/exec` continua a mesma.
Se você criar uma **nova** implantação em vez disso, a URL muda e é preciso atualizar o `APPS_SCRIPT_URL`.

## Limites

- Até 5 MB por arquivo (verificado na página e no script).
- Até 30 envios por hora (`MAX_SUBMISSIONS_PER_HOUR`).
- Cota do Gmail: 100 e-mails por dia em contas gratuitas e 1.500 no Google Workspace.
