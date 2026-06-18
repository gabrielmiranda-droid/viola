# Viola Printer Service

Servico local de impressao do Viola PDV.

O frontend nunca fala diretamente com a impressora. Ele cria um registro em
`public.print_jobs`, e este servico Python busca os jobs pendentes e envia para
a impressora configurada.

## Fluxo

```txt
Venda finalizada ou pedido teste
Supabase print_jobs
printer-service Python
Printer
MockPrinter ou ElginPrinter
```

## Em casa

Use o modo mock:

```env
PRINTER_MODE=mock
```

O servico cria arquivos `.txt` em:

```txt
printer-service/printed_mock/
```

Exemplos:

```txt
pedido_001_cozinha.txt
pedido_001_caixa.txt
pedido_001_delivery.txt
```

Esses arquivos contem exatamente o texto formatado que futuramente sera enviado
para a Elgin.

## No cliente

Troque apenas:

```env
PRINTER_MODE=usb
```

Configure tambem:

```env
PRINTER_VENDOR_ID=
PRINTER_PRODUCT_ID=
```

Depois conecte a Elgin i9 USB. A classe `ElginPrinter` ja esta separada para
receber a implementacao real com `python-escpos`, sem alterar o frontend nem o
restante da arquitetura.

## Instalar

```bash
cd printer-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Preencha no `.env`:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

Use a `service_role` somente neste servico local/servidor. Nunca coloque essa
chave no frontend.

## Rodar

```bash
python main.py
```

No Windows, existem dois executaveis em `dist/`:

```txt
ViolaPrinterMonitor.exe
```

Abre uma janela visual com status e logs. Recomendado para usar no cliente.

```txt
ViolaPrinterService.exe
```

Abre a versao de terminal.

Logs esperados:

```txt
Conectando...
Buscando pedidos...
Pedido encontrado.
Gerando cozinha...
Gerando caixa...
Gerando delivery...
Arquivos criados.
Pedido concluido.
```

## Banco de dados

Antes de usar, execute no Supabase SQL Editor:

```txt
supabase/print-jobs-migration.sql
```
