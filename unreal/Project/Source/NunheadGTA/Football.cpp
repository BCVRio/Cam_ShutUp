#include "Football.h"
#include "Components/StaticMeshComponent.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/World.h"
#include "CollisionQueryParams.h"

AFootball::AFootball()
{
	PrimaryActorTick.bCanEverTick = true;
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	RootComponent = Mesh;
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Sphere(TEXT("/Engine/BasicShapes/Sphere"));
	if (Sphere.Succeeded()) Mesh->SetStaticMesh(Sphere.Object);
	Mesh->SetWorldScale3D(FVector(0.22f));             // 22 cm ball from the 1 m sphere
	Mesh->SetSimulatePhysics(true);
	Mesh->SetEnableGravity(true);
	Mesh->SetMassOverrideInKg(NAME_None, 0.43f, true);
	Mesh->SetLinearDamping(0.05f);
	Mesh->SetAngularDamping(0.6f);
	Mesh->SetCollisionProfileName(TEXT("Football"));
	Mesh->SetNotifyRigidBodyCollision(true);
	Mesh->SetUseCCD(true);
	Mesh->SetCastShadow(true);
}

void AFootball::BeginPlay()
{
	Super::BeginPlay();
	SpawnPoint = GetActorLocation();
}

bool AFootball::IsOnGround() const
{
	FHitResult Hit; const FVector Start = GetActorLocation();
	FCollisionQueryParams P; P.AddIgnoredActor(this);
	return GetWorld()->LineTraceSingleByChannel(Hit, Start, Start - FVector(0, 0, 16.f), ECC_Visibility, P);
}

FVector AFootball::GetVelocity2D() const { FVector V = Mesh->GetPhysicsLinearVelocity(); V.Z = 0; return V; }

void AFootball::Tick(float Dt)
{
	Super::Tick(Dt);
	if (!Mesh->IsSimulatingPhysics()) return;
	const float Mass = Mesh->GetMass();
	const FVector V = Mesh->GetPhysicsLinearVelocity();
	const FVector W = Mesh->GetPhysicsAngularVelocityInRadians();
	const float Speed = V.Size();
	if (Speed < 1.f) return;
	// Magnus: the spin bends the flight (and the roll)
	FVector F = FVector::CrossProduct(W, V) * MagnusCoefficient * Mass;
	// air drag, quadratic
	F -= V * Speed * AirDrag * Mass * 0.01f;
	// rolling resistance on the ground
	if (IsOnGround()) F -= V.GetSafeNormal2D() * RollingResistance * 981.f * Mass * 0.1f;
	Mesh->AddForce(F);
	// fell off the world: back to the spot
	if (GetActorLocation().Z < -5000.f) ResetToSpawn();
}

void AFootball::Kick(const FVector& Dir, float Power, float Curl, float Loft, FName Kicker)
{
	FVector D = Dir.GetSafeNormal2D();
	D.Z = FMath::Clamp(Loft, 0.f, 1.f) * 0.55f;
	D.Normalize();
	Mesh->SetPhysicsLinearVelocity(D * Power);
	// spin about the up axis for curl, a little topspin from the strike
	const FVector Spin = FVector(0, 0, -Curl * 40.f) + FVector::CrossProduct(FVector::UpVector, D) * 12.f;
	Mesh->SetPhysicsAngularVelocityInRadians(Spin);
	LastKicker = Kicker;
}

void AFootball::ResetToSpawn()
{
	Mesh->SetPhysicsLinearVelocity(FVector::ZeroVector);
	Mesh->SetPhysicsAngularVelocityInRadians(FVector::ZeroVector);
	SetActorLocation(SpawnPoint + FVector(0, 0, 30.f), false, nullptr, ETeleportType::TeleportPhysics);
	LastKicker = NAME_None;
}
