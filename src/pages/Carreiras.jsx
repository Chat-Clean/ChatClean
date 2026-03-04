import { ArrowLeft, MapPin, Clock, Users, Briefcase } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";

const Carreiras = () => {
  const vagas = [
    {
      titulo: "Desenvolvedor Full Stack",
      departamento: "Tecnologia",
      localizacao: "Remoto",
      tipo: "CLT",
      nivel: "Pleno",
      descricao:
        "Desenvolver e manter aplicações web usando React, Node.js e banco de dados relacionais.",
    },
    {
      titulo: "Especialista em Customer Success",
      departamento: "Atendimento",
      localizacao: "São Paulo, SP",
      tipo: "CLT",
      nivel: "Sênior",
      descricao:
        "Garantir o sucesso dos clientes, implementação e treinamento da plataforma ChatClean.",
    },
    {
      titulo: "Analista de Marketing Digital",
      departamento: "Marketing",
      localizacao: "Híbrido",
      tipo: "CLT",
      nivel: "Júnior",
      descricao:
        "Criar e executar estratégias de marketing digital, gerenciar campanhas e analisar métricas.",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <h1 className="text-2xl font-bold text-gray-900">Carreiras</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Faça Parte da Revolução do Atendimento
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Na ChatClean, estamos transformando a forma como as empresas se
            relacionam com seus clientes. Junte-se a nós e ajude a construir o
            futuro do atendimento digital.
          </p>
        </div>

        {/* Benefícios */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <Card>
            <CardHeader>
              <Users className="h-8 w-8 text-green-600 mb-2" />
              <CardTitle>Ambiente Colaborativo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Trabalhe com uma equipe talentosa e apaixonada por inovação e
                tecnologia.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Clock className="h-8 w-8 text-green-600 mb-2" />
              <CardTitle>Flexibilidade</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Horários flexíveis e opções de trabalho remoto para equilibrar
                vida pessoal e profissional.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Briefcase className="h-8 w-8 text-green-600 mb-2" />
              <CardTitle>Crescimento</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Oportunidades de desenvolvimento profissional e crescimento
                dentro da empresa.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Vagas Disponíveis */}
        <div className="mb-12">
          <h3 className="text-2xl font-bold text-gray-900 mb-6">
            Vagas Disponíveis
          </h3>
          <div className="space-y-6">
            {vagas.map((vaga, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{vaga.titulo}</CardTitle>
                      <CardDescription className="flex items-center mt-2">
                        <MapPin className="h-4 w-4 mr-1" />
                        {vaga.localizacao}
                      </CardDescription>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Badge variant="secondary">{vaga.departamento}</Badge>
                      <Badge variant="outline">{vaga.nivel}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">{vaga.descricao}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">{vaga.tipo}</span>
                    <Button
                      onClick={() =>
                        window.open(
                          "https://api.whatsapp.com/send?phone=5584996950105&text=Tenho+interesse+na+vaga+de+" +
                            encodeURIComponent(vaga.titulo),
                          "_blank",
                        )
                      }
                    >
                      Candidatar-se
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center bg-white rounded-lg p-8 shadow-sm">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Não encontrou a vaga ideal?
          </h3>
          <p className="text-gray-600 mb-6">
            Envie seu currículo e entraremos em contato quando surgir uma
            oportunidade que combine com seu perfil.
          </p>
          <Button
            size="lg"
            onClick={() =>
              window.open(
                "https://api.whatsapp.com/send?phone=5584996950105&text=Gostaria+de+enviar+meu+currículo+para+futuras+oportunidades",
                "_blank",
              )
            }
          >
            Enviar Currículo
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Carreiras;
