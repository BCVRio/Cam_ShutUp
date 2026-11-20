#include "Goal.h"
#include "Football.h"
#include "NunheadGameMode.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "UObject/ConstructorHelpers.h"
#include "Kismet/GameplayStatics.h"

AGoal::AGoal()
{
	PrimaryActorTick.bCanEverTick = false;
	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root")); RootComponent = Root;
	Trigger = CreateDefaultSubobject<UBoxComponent>(TEXT("Trigger")); Trigger->SetupAttachment(Root);
	Trigger->SetCollisionProfileName(TEXT("OverlapAllDynamic"));
	Trigger->OnComponentBeginOverlap.AddDynamic(this, &AGoal::OnTriggerBegin);
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cyl(TEXT("/Engine/BasicShapes/Cylinder"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube"));
	auto MakePost = [&](const TCHAR* Name) { UStaticMeshComponent* C = CreateDefaultSubobject<UStaticMeshComponent>(Name); C->SetupAttachment(Root); if (Cyl.Succeeded()) C->SetStaticMesh(Cyl.Object); C->SetCollisionProfileName(TEXT("BlockAll")); return C; };
	LeftPost = MakePost(TEXT("LeftPost")); RightPost = MakePost(TEXT("RightPost")); Crossbar = MakePost(TEXT("Crossbar"));
	Back = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Back")); Back->SetupAttachment(Root); if (Cube.Succeeded()) Back->SetStaticMesh(Cube.Object); Back->SetCollisionProfileName(TEXT("BlockAll")); Back->SetVisibility(false);
}

void AGoal::OnConstruction(const FTransform& T)
{
	Super::OnConstruction(T);
	const float R = 6.f;   // post radius cm (cylinder is 100 cm wide, 100 tall)
	LeftPost->SetRelativeLocation(FVector(0, -Width / 2, Height / 2)); LeftPost->SetRelativeScale3D(FVector(R * 2 / 100.f, R * 2 / 100.f, Height / 100.f));
	RightPost->SetRelativeLocation(FVector(0, Width / 2, Height / 2)); RightPost->SetRelativeScale3D(FVector(R * 2 / 100.f, R * 2 / 100.f, Height / 100.f));
	Crossbar->SetRelativeLocation(FVector(0, 0, Height)); Crossbar->SetRelativeRotation(FRotator(0.f, 0.f, 90.f)); Crossbar->SetRelativeScale3D(FVector(R * 2 / 100.f, R * 2 / 100.f, (Width + R * 2) / 100.f));   // roll: the bar runs along Y
	// the net back-stop, 1.5 m behind the line (goal faces +X: the ball comes from +X toward -X)
	Back->SetRelativeLocation(FVector(-150.f, 0, Height / 2)); Back->SetRelativeScale3D(FVector(0.1f, (Width + 20.f) / 100.f, Height / 100.f));
	Trigger->SetRelativeLocation(FVector(-80.f, 0, Height / 2)); Trigger->SetBoxExtent(FVector(60.f, Width / 2 - 10.f, Height / 2 - 5.f));
}

void AGoal::OnTriggerBegin(UPrimitiveComponent*, AActor* Other, UPrimitiveComponent*, int32, bool, const FHitResult&)
{
	AFootball* Ball = Cast<AFootball>(Other); if (!Ball) return;
	if (ANunheadGameMode* GM = Cast<ANunheadGameMode>(UGameplayStatics::GetGameMode(this))) GM->BallInGoal(this, Ball);
}
